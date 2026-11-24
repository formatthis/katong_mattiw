import hashlib
import random
import uuid
from datetime import timedelta
from django.conf import settings
from django.core.cache import cache
from django.http import Http404
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse, HttpResponse
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods
from .forms import KrathongForm, STYLES, STYLE_CATEGORIES
from .models import BackgroundMusic, FloatingDesign, Krathong, PairSession, StoredFile
from .artwork import art_catalog


READY_WINDOW = timedelta(seconds=20)
COUNTDOWN_LEAD = timedelta(milliseconds=4500)


def pair_role(room, request):
    if str(room.pk) in request.session.get('hosted_pairs', []):
        return 'host'
    if str(room.pk) in request.session.get('joined_pairs', []):
        return 'guest'
    return 'visitor'


def ready_left(moment, now):
    """Seconds left in someone's 'float together' press, or 0 once it lapsed."""
    if not moment:
        return 0
    return max(0.0, round((moment + READY_WINDOW - now).total_seconds(), 2))


def pair_state(room, request):
    participants = list(room.participants.select_related('design').order_by('pair_slot'))
    now = timezone.now()
    expired = room.expires_at <= now
    if room.launch_at:
        stage = 'launched' if room.launch_at <= now else 'countdown'
    elif room.guest_claimed:
        stage = 'gathering'
    else:
        stage = 'expired' if expired else 'waiting'
    launching = stage in ('countdown', 'launched')
    return {
        'id': str(room.pk), 'kind': room.kind,
        'status': 'complete' if room.guest_claimed else 'expired' if expired else 'waiting',
        'stage': stage,
        'viewer_role': pair_role(room, request),
        'invite_url': reverse('couple', kwargs={'token': room.invite_token}),
        'api_url': reverse('couple-detail', kwargs={'token': room.invite_token}),
        'join_url': reverse('couple-join', kwargs={'token': room.invite_token}),
        'ready_url': reverse('couple-ready', kwargs={'token': room.invite_token}),
        'expires_at': room.expires_at.isoformat(),
        'launch_at': room.launch_at.isoformat() if room.launch_at else None,
        'server_now': now.isoformat(),
        'ready_window': READY_WINDOW.total_seconds(),
        'ready': {
            'host': launching or ready_left(room.host_ready_at, now),
            'guest': launching or ready_left(room.guest_ready_at, now),
        },
        'participants': [item.as_dict() for item in participants],
    }


def visible_records(kind):
    # Couples stay off the public pond until both pressed and the countdown ended.
    return Krathong.objects.filter(kind=kind).filter(
        Q(pair_session__isnull=True) | Q(pair_session__launch_at__lte=timezone.now())
    )


def remember_pair(request, key, room):
    request.session[key] = (request.session.get(key, []) + [str(room.pk)])[-50:]


def client_ip(request):
    # Behind Render every request arrives from the proxy; use the forwarded client address.
    if getattr(settings, 'BEHIND_PROXY', False):
        forwarded = request.META.get('HTTP_CF_CONNECTING_IP') or request.META.get('HTTP_TRUE_CLIENT_IP')
        if forwarded:
            return forwarded.strip()
        chain = [part.strip() for part in request.META.get('HTTP_X_FORWARDED_FOR', '').split(',') if part.strip()]
        if chain:
            return chain[-1]
    return request.META.get('REMOTE_ADDR', '')


@require_GET
def stored_media(request, name):
    """Serve an upload kept in the database (MEDIA_IN_DATABASE)."""
    row = StoredFile.objects.filter(name=name).only('content', 'content_type').first()
    if row is None:
        raise Http404
    response = HttpResponse(bytes(row.content), content_type=row.content_type)
    # Upload names are random and never reused, so they can be cached for a long time.
    response['Cache-Control'] = 'public, max-age=31536000, immutable'
    response['X-Content-Type-Options'] = 'nosniff'
    return response


def rate_limit(request):
    identity = hashlib.sha256(client_ip(request).encode()).hexdigest()
    key = f'float:{identity}'
    cache.add(key, 0, timeout=60)
    try:
        attempts = cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=60)
        attempts = 1
    if attempts > 10:
        response = JsonResponse({'message': 'พักสักครู่นะ แล้วลองใหม่ใน 1 นาที'}, status=429)
        response['Retry-After'] = '60'
        return response


def feed_records(kind):
    recent = list(visible_records(kind).select_related('design')[:80])
    pair_ids = {item.pair_session_id for item in recent if item.pair_session_id}
    groups = {}
    if pair_ids:
        for item in visible_records(kind).filter(pair_session_id__in=pair_ids).select_related('design').order_by('pair_slot'):
            groups.setdefault(item.pair_session_id, []).append(item)
    result, seen = [], set()
    for item in recent:
        key = item.pair_session_id or item.pk
        if key in seen:
            continue
        seen.add(key)
        group = groups.get(item.pair_session_id, [item])
        if len(result) + len(group) <= 80:
            result.extend(group)
    return result


def save_participant(data, kind, room=None, slot=None):
    item = Krathong(
        name=data['name'], wish=data['wish'], style=data['style'], kind=kind, design=data['design'],
        pair_session=room, pair_slot=slot, appearance=data['appearance'],
        x=room.x if room else round(random.uniform(9, 90), 2),
        y=room.y if room else round(random.uniform(32, 83), 2),
    )
    if data['portrait']:
        item.portrait = data['portrait']
    try:
        item.save()
    except Exception:
        if item.portrait:
            item.portrait.delete(save=False)
        raise
    return item

@ensure_csrf_cookie
@never_cache
@require_GET
def index(request, kind='krathong', pair=None, shared_wish=None):
    is_lantern = kind == 'lantern'
    context = {
        'kind': kind, 'is_lantern': is_lantern,
        'object_name': 'โคม' if is_lantern else 'กระทง',
        'scene_title': 'ลานลอยโคม' if is_lantern else 'สระลอยกระทง',
        'api_url': '/api/lanterns/' if is_lantern else '/api/krathongs/',
        'styles': [{'value': value, 'label': label, 'category': STYLE_CATEGORIES.get(value, 'other')} for value, label in STYLES[kind]],
        'designs': [item.as_dict() for item in FloatingDesign.objects.filter(kind=kind, is_active=True)],
        'music': BackgroundMusic.objects.filter(enabled=True).exclude(audio='').order_by('pk').first(),
        'pair_bootstrap': pair_state(pair, request) if pair else None,
        'art_catalog': art_catalog(),
        'shared_wish': None,
    }
    if shared_wish:
        data = shared_wish.as_dict()
        partner = Krathong.objects.filter(pair_session_id=shared_wish.pair_session_id).exclude(pk=shared_wish.pk).select_related('design').first() if shared_wish.pair_session_id else None
        data['partner'] = partner.as_dict() if partner else None
        context.update({
            'shared_wish': data,
            'share_title': f'{shared_wish.name} — คำอธิษฐานในคืนลอย',
            'share_description': shared_wish.wish,
            'share_canonical': request.build_absolute_uri(reverse('shared-wish',kwargs={'pk':shared_wish.pk})),
            'share_image': request.build_absolute_uri(reverse('wish-card',kwargs={'pk':shared_wish.pk})),
        })
    return render(request, 'pond/index.html', context)


@require_GET
def shared_wish(request, pk):
    item = get_object_or_404(Krathong.objects.select_related('design'),pk=pk)
    return index(request,kind=item.kind,shared_wish=item)


@require_GET
def wish_card(request, pk):
    from .cards import render_card
    layout = request.GET.get('layout','post')
    if layout not in ('post','story'):
        return JsonResponse({'message':'เลือกรูปแบบ post หรือ story'},status=400)
    item = get_object_or_404(Krathong.objects.select_related('design'),pk=pk)
    response = HttpResponse(render_card(item,layout),content_type='image/png')
    response['Cache-Control'] = 'public, max-age=300'
    if request.GET.get('download') == '1':
        response['Content-Disposition'] = f'attachment; filename="khuenloy-{item.pk.hex[:8]}-{layout}.png"'
    return response

@never_cache
@require_http_methods(['GET', 'POST'])
def krathongs(request, kind='krathong'):
    records = visible_records(kind)
    if request.method == 'GET':
        return JsonResponse({
            'total': records.count(),
            'krathongs': [item.as_dict() for item in feed_records(kind)],
        })
    limited = rate_limit(request)
    if limited:
        return limited
    is_couple = request.POST.get('mode') == 'couple'
    form = KrathongForm(request.POST, request.FILES, kind=kind, require_portrait=is_couple)
    if not form.is_valid():
        return JsonResponse({'message': 'กรุณาตรวจสอบข้อมูลอีกครั้ง', 'errors': form.errors}, status=400)
    data = form.cleaned_data
    room = None
    with transaction.atomic():
        if is_couple:
            room = PairSession.objects.create(kind=kind, x=round(random.uniform(30, 70), 2), y=round(random.uniform(40, 73), 2))
        item = save_participant(data, kind, room, 1 if room else None)
    result = {'krathong': item.as_dict(), 'total': records.count()}
    if room:
        remember_pair(request, 'hosted_pairs', room)
        result['pair'] = pair_state(room, request)
    return JsonResponse(result, status=201)


@ensure_csrf_cookie
@never_cache
@require_GET
def couple(request, token):
    room = get_object_or_404(PairSession, invite_token=token)
    request.session.setdefault('couple_visitor', uuid.uuid4().hex)
    return index(request, kind=room.kind, pair=room)


@never_cache
@require_GET
def couple_detail(request, token):
    return JsonResponse({'pair': pair_state(get_object_or_404(PairSession, invite_token=token), request)})


@never_cache
@require_http_methods(['POST'])
def couple_join(request, token):
    limited = rate_limit(request)
    if limited:
        return limited
    room = get_object_or_404(PairSession, invite_token=token)
    if str(room.pk) in request.session.get('hosted_pairs', []):
        return JsonResponse({'message': 'ส่งลิงก์นี้ให้อีกคนเข้ามาลอยด้วยกันนะ'}, status=403)
    if room.expires_at <= timezone.now() and not room.guest_claimed:
        return JsonResponse({'message': 'ลิงก์นี้หมดเวลาแล้ว ให้คนชวนสร้างรอบใหม่ได้เลย'}, status=410)
    if room.guest_claimed:
        return JsonResponse({'message': 'รอบนี้ลอยครบสองคนแล้ว', 'pair': pair_state(room, request)}, status=409)
    form = KrathongForm(request.POST, request.FILES, kind=room.kind, require_portrait=True)
    if not form.is_valid():
        return JsonResponse({'message': 'เพิ่มรูปและคำอวยพรของเราให้ครบก่อนนะ', 'errors': form.errors}, status=400)
    with transaction.atomic():
        claimed = PairSession.objects.filter(pk=room.pk, guest_claimed=False, expires_at__gt=timezone.now()).update(guest_claimed=True)
        if not claimed:
            room.refresh_from_db()
            return JsonResponse({'message': 'รอบนี้มีคนเข้าร่วมแล้ว', 'pair': pair_state(room, request)}, status=409)
        item = save_participant(form.cleaned_data, room.kind, room, 2)
    room.refresh_from_db()
    remember_pair(request, 'joined_pairs', room)
    return JsonResponse({'krathong': item.as_dict(), 'total': visible_records(room.kind).count(), 'pair': pair_state(room, request)}, status=201)


@never_cache
@require_http_methods(['POST'])
def couple_ready(request, token):
    """One person presses 'float together'. When both presses overlap, set a shared launch time."""
    room = get_object_or_404(PairSession, invite_token=token)
    role = pair_role(room, request)
    if role == 'visitor':
        return JsonResponse({'message': 'เฉพาะสองคนในห้องนี้ที่กดลอยได้', 'pair': pair_state(room, request)}, status=403)
    if not room.guest_claimed:
        return JsonResponse({'message': 'รออีกคนเข้ามาก่อน แล้วค่อยกดลอยพร้อมกันนะ', 'pair': pair_state(room, request)}, status=409)
    ready = request.POST.get('ready', '1') != '0'
    field = 'host_ready_at' if role == 'host' else 'guest_ready_at'
    with transaction.atomic():
        # Write first, then read: SQLite serialises writers, so the second press always sees the first.
        now = timezone.now()
        PairSession.objects.filter(pk=room.pk, launch_at__isnull=True).update(**{field: now if ready else None})
        room.refresh_from_db()
        if ready and room.launch_at is None and ready_left(room.host_ready_at, now) and ready_left(room.guest_ready_at, now):
            PairSession.objects.filter(pk=room.pk, launch_at__isnull=True).update(launch_at=now + COUNTDOWN_LEAD)
            room.refresh_from_db()
    return JsonResponse({'pair': pair_state(room, request)})

@require_GET
def krathong_detail(request, pk, kind='krathong'):
    item = get_object_or_404(Krathong.objects.select_related('design'), pk=pk, kind=kind)
    partner = Krathong.objects.filter(pair_session_id=item.pair_session_id).exclude(pk=item.pk).select_related('design').first() if item.pair_session_id else None
    return JsonResponse({'krathong': item.as_dict(), 'partner': partner.as_dict() if partner else None})
