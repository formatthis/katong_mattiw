from io import BytesIO
import wave
import json
from tempfile import TemporaryDirectory
from datetime import timedelta
from PIL import Image
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from .models import Krathong, FloatingDesign, BackgroundMusic, PairSession
from .forms import FloatingDesignAdminForm, BackgroundMusicAdminForm
from django.contrib.auth import get_user_model


class PondTests(TestCase):
    def setUp(self):
        cache.clear()
        self.media = TemporaryDirectory(prefix='khuenloy-test-')
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name)
        self.settings_override.enable()
        self.addCleanup(self.media.cleanup)
        self.addCleanup(self.settings_override.disable)

    def create(self, **extra):
        return self.client.post('/api/krathongs/', {'wish': 'ขอให้ทุกคนมีความสุข', 'style': 'lotus', **extra})

    def test_home_and_anonymous_creation(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'คืนลอย')
        self.assertIn('csrftoken', response.cookies)
        response = self.create()
        self.assertEqual(response.status_code, 201)
        item = Krathong.objects.get()
        self.assertEqual(item.name, 'ผู้ร่วมอธิษฐาน')
        self.assertEqual(item.wish, 'ขอให้ทุกคนมีความสุข')
        self.assertGreaterEqual(item.x, 9)
        self.assertLessEqual(item.y, 83)

    def test_empty_and_excessive_wishes_are_rejected(self):
        for wish in ['', '   ', 'ก' * 281]:
            with self.subTest(wish=wish[:10]):
                self.assertEqual(self.create(wish=wish).status_code, 400)
        self.assertFalse(Krathong.objects.exists())

    def test_invalid_style_and_honeypot_are_rejected(self):
        self.assertEqual(self.create(style='other').status_code, 400)
        self.assertEqual(self.create(website='spam').status_code, 400)

    def test_name_is_trimmed_and_limited(self):
        self.assertEqual(self.create(name='  มะลิ  ').json()['krathong']['name'], 'มะลิ')
        self.assertEqual(self.create(name='ก' * 41).status_code, 400)

    def test_upload_is_reencoded_resized_and_metadata_removed(self):
        image = Image.new('RGB', (900, 600), '#dfb884')
        output = BytesIO()
        metadata = Image.Exif()
        metadata[315] = 'private author'
        image.save(output, format='JPEG', exif=metadata)
        upload = SimpleUploadedFile('portrait.jpg', output.getvalue(), content_type='image/jpeg')
        response = self.create(portrait=upload)
        self.assertEqual(response.status_code, 201)
        item = Krathong.objects.get()
        self.assertTrue(item.portrait.name.endswith('.jpg'))
        with Image.open(item.portrait.path) as saved:
            self.assertEqual(saved.size, (480, 480))
            self.assertFalse(saved.getexif())
        self.assertIn('/media/portraits/', response.json()['krathong']['portrait'])

    def test_disguised_and_oversized_uploads_are_rejected(self):
        fake = SimpleUploadedFile('fake.jpg', b'<svg onload="alert(1)"></svg>', content_type='image/jpeg')
        self.assertEqual(self.create(portrait=fake).status_code, 400)
        huge = SimpleUploadedFile('large.png', b'x' * (5 * 1024 * 1024 + 1), content_type='image/png')
        self.assertEqual(self.create(portrait=huge).status_code, 400)
        self.assertFalse(Krathong.objects.exists())

    def test_rate_limit(self):
        for _ in range(10):
            self.assertEqual(self.create().status_code, 201)
        response = self.create()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response['Retry-After'], '60')
        self.assertEqual(Krathong.objects.count(), 10)

    def test_feed_is_bounded_and_older_wish_is_shareable(self):
        old = Krathong.objects.create(name='คำอธิษฐานแรก', wish='มีความสุข', style='gold', x=50, y=60)
        Krathong.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=1))
        Krathong.objects.bulk_create([
            Krathong(wish=f'ความสุข {i}', style='lotus', x=20, y=60) for i in range(85)
        ])
        response = self.client.get('/api/krathongs/')
        self.assertEqual(response.json()['total'], 86)
        self.assertEqual(len(response.json()['krathongs']), 80)
        self.assertNotIn(str(old.pk), [row['id'] for row in response.json()['krathongs']])
        detail = self.client.get(f'/api/krathongs/{old.pk}/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()['krathong']['name'], 'คำอธิษฐานแรก')

    def test_csrf_is_required_without_login(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(client.post('/api/krathongs/', {'wish':'ขอให้สุขใจ','style':'lotus'}).status_code, 403)
        client.get('/')
        response = client.post('/api/krathongs/', {'wish':'ขอให้สุขใจ','style':'lotus'}, HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value)
        self.assertEqual(response.status_code, 201)

    def test_read_only_and_http_methods(self):
        self.assertEqual(self.client.get('/api/krathongs/').json()['total'], 0)
        self.assertEqual(self.client.put('/api/krathongs/').status_code, 405)
        self.assertEqual(self.client.post('/').status_code, 405)

    def test_public_api_does_not_expose_server_paths_or_ip(self):
        data = self.create().json()['krathong']
        self.assertEqual(set(data), {'id','name','wish','style','portrait','x','y','created_at','kind','design','pair_id','pair_slot','appearance'})

    def test_custom_appearance_survives_save_and_public_detail(self):
        appearance={'enabled':True,'leaf':'lotus','color':'#B594DE','leaf_color':'#477A53','candles':2,'incense':1,'decoration':'pearls'}
        response=self.create(appearance=json.dumps(appearance))
        self.assertEqual(response.status_code,201,response.content)
        item=Krathong.objects.get()
        self.assertEqual(item.appearance['color'],'#b594de')
        self.assertEqual(item.appearance['leaf'],'lotus')
        self.assertEqual(item.appearance['candles'],2)
        detail=self.client.get(f'/api/krathongs/{item.pk}/').json()['krathong']
        self.assertEqual(detail['appearance'],item.appearance)

    def test_custom_appearance_rejects_invalid_colors_shapes_and_counts(self):
        for field,value in [('color','red\" onload=\"alert(1)'),('leaf',[]),('decoration',{}),('candles',True),('incense',100),('enabled','yes')]:
            with self.subTest(field=field):
                response=self.create(appearance=json.dumps({'enabled':True,field:value}))
                self.assertEqual(response.status_code,400)
        self.assertFalse(Krathong.objects.exists())

    def test_downloadable_post_and_story_are_real_png_with_portrait_and_thai_wish(self):
        response=self.create(name='มะลิ',wish='ขอให้ได้เดินทางด้วยกันอีกหลาย ๆ ครั้ง',portrait=self.portrait(),appearance=json.dumps({'enabled':True,'leaf':'round','decoration':'ribbon','candles':3}))
        self.assertEqual(response.status_code,201)
        item=Krathong.objects.get()
        for layout,size in [('post',(1080,1350)),('story',(1080,1920))]:
            card=self.client.get(f'/wish/{item.pk}/card.png?layout={layout}&download=1')
            self.assertEqual(card.status_code,200)
            self.assertEqual(card['Content-Type'],'image/png')
            self.assertIn('attachment;',card['Content-Disposition'])
            with Image.open(BytesIO(card.content)) as image:
                self.assertEqual(image.size,size)
                self.assertEqual(image.format,'PNG')
                self.assertIsNotNone(image.getbbox())

    def test_shared_wish_page_contains_server_side_image_metadata_and_bootstrap(self):
        item_id=self.create(name='ชื่อของเรา',wish='ขอให้มีความสุข').json()['krathong']['id']
        response=self.client.get(f'/wish/{item_id}/')
        self.assertEqual(response.status_code,200)
        head=response.content.decode().split('</head>')[0]
        self.assertIn('property="og:image"',head)
        self.assertIn(f'/wish/{item_id}/card.png',head)
        self.assertIn('ขอให้มีความสุข',head)
        self.assertContains(response,'id="share-dialog"')
        self.assertContains(response,'conne')
        self.assertEqual(response.context['shared_wish']['id'],item_id)
        self.assertEqual(self.client.get(f'/wish/{item_id}/card.png?layout=invalid').status_code,400)

    def portrait(self, color='#dba66b'):
        stream = BytesIO()
        Image.new('RGB',(160,160),color).save(stream,format='JPEG')
        return SimpleUploadedFile('face.jpg',stream.getvalue(),content_type='image/jpeg')

    def new_pair(self, kind='krathong'):
        url = '/api/lanterns/' if kind == 'lantern' else '/api/krathongs/'
        response = self.client.post(url, {'mode':'couple','style':'paper' if kind == 'lantern' else 'cat','name':'คนชวน','wish':'ขอให้เราได้เที่ยวด้วยกัน','portrait':self.portrait()})
        self.assertEqual(response.status_code,201,response.content)
        return response.json()

    def test_pair_invite_and_separate_partners_are_persisted(self):
        created = self.new_pair()
        state = created['pair']
        host = created['krathong']
        self.assertEqual(state['viewer_role'],'host')
        self.assertEqual(host['pair_slot'],1)
        self.assertEqual(state['status'],'waiting')
        guest = Client()
        page = guest.get(state['invite_url'])
        self.assertEqual(page.status_code,200)
        self.assertEqual(page.context['pair_bootstrap']['viewer_role'],'visitor')
        response = guest.post(state['join_url'],{'style':'rabbit','name':'คนมาลอยด้วย','wish':'ขอให้เธอมีความสุขทุกวัน','portrait':self.portrait('#a9c3a1')})
        self.assertEqual(response.status_code,201,response.content)
        partner = response.json()['krathong']
        self.assertEqual(partner['pair_id'],host['pair_id'])
        self.assertEqual(partner['pair_slot'],2)
        self.assertNotEqual(partner['portrait'],host['portrait'])
        self.assertNotEqual(partner['wish'],host['wish'])
        self.assertEqual((host['x'],host['y']),(partner['x'],partner['y']))
        self.assertEqual(guest.get(state['api_url']).json()['pair']['viewer_role'],'guest')
        self.assertEqual(self.client.get(state['api_url']).json()['pair']['status'],'complete')
        self.assertEqual(Krathong.objects.count(),2)
        self.assertEqual(PairSession.objects.count(),1)
        detail = self.client.get(f'/api/krathongs/{host["id"]}/').json()
        self.assertEqual(detail['partner']['id'],partner['id'])
        room = PairSession.objects.get()
        public_feed = self.client.get('/api/krathongs/')
        self.assertNotContains(public_feed,room.invite_token)
        self.assertNotContains(public_feed,'invite_url')

    def test_couple_floats_only_after_both_press_together(self):
        state = self.new_pair()['pair']
        self.assertEqual(state['stage'],'waiting')
        self.assertEqual(self.client.post(state['ready_url']).status_code,409)
        guest = Client()
        self.assertEqual(guest.post(state['ready_url']).status_code,403)
        joined = guest.post(state['join_url'],{'style':'rabbit','wish':'ลอยไปด้วยกันนะ','portrait':self.portrait()}).json()['pair']
        self.assertEqual(joined['stage'],'gathering')
        self.assertEqual(self.client.get('/api/krathongs/').json()['total'],0)
        self.assertEqual(Client().post(state['ready_url']).status_code,403)
        host_press = self.client.post(state['ready_url']).json()['pair']
        self.assertTrue(host_press['ready']['host'])
        self.assertFalse(host_press['ready']['guest'])
        self.assertIsNone(host_press['launch_at'])
        # A press that lapsed before the partner pressed does not count.
        PairSession.objects.update(host_ready_at=timezone.now()-timedelta(seconds=25))
        lonely = guest.post(state['ready_url']).json()['pair']
        self.assertIsNone(lonely['launch_at'])
        self.assertEqual(lonely['stage'],'gathering')
        together = self.client.post(state['ready_url']).json()['pair']
        self.assertEqual(together['stage'],'countdown')
        self.assertIsNotNone(together['launch_at'])
        self.assertEqual(guest.get(state['api_url']).json()['pair']['launch_at'],together['launch_at'])
        self.assertEqual(self.client.get('/api/krathongs/').json()['total'],0)
        # Pressing again during the countdown cannot move the shared moment.
        self.assertEqual(guest.post(state['ready_url'],{'ready':'0'}).json()['pair']['launch_at'],together['launch_at'])
        PairSession.objects.update(launch_at=timezone.now()-timedelta(seconds=1))
        self.assertEqual(self.client.get(state['api_url']).json()['pair']['stage'],'launched')
        self.assertEqual(self.client.get('/api/krathongs/').json()['total'],2)

    def test_cancelled_press_does_not_launch(self):
        state = self.new_pair()['pair']
        guest = Client()
        guest.post(state['join_url'],{'style':'duck','wish':'ขอให้สุขใจ','portrait':self.portrait()})
        self.client.post(state['ready_url'])
        self.assertFalse(self.client.post(state['ready_url'],{'ready':'0'}).json()['pair']['ready']['host'])
        self.assertIsNone(guest.post(state['ready_url']).json()['pair']['launch_at'])

    def test_couple_requires_a_photo_without_creating_empty_room(self):
        response = self.create(mode='couple')
        self.assertEqual(response.status_code,400)
        self.assertIn('portrait',response.json()['errors'])
        self.assertFalse(PairSession.objects.exists())
        self.assertFalse(Krathong.objects.exists())

    def test_pair_guest_validation_does_not_claim_the_second_slot(self):
        state = self.new_pair()['pair']
        guest = Client()
        response = guest.post(state['join_url'],{'style':'duck','wish':'มีความสุข'})
        self.assertEqual(response.status_code,400)
        self.assertFalse(PairSession.objects.get().guest_claimed)
        self.assertEqual(Krathong.objects.count(),1)
        response = guest.post(state['join_url'],{'style':'duck','wish':'   ','portrait':self.portrait()})
        self.assertEqual(response.status_code,400)
        self.assertFalse(PairSession.objects.get().guest_claimed)

    def test_host_cannot_take_guest_slot_and_a_third_person_cannot_overwrite(self):
        state = self.new_pair()['pair']
        response = self.client.post(state['join_url'],{'style':'duck','wish':'ทดสอบ'})
        self.assertEqual(response.status_code,403)
        guest = Client()
        response = guest.post(state['join_url'],{'style':'duck','wish':'ขอให้สุขใจ','portrait':self.portrait()})
        self.assertEqual(response.status_code,201)
        response = Client().post(state['join_url'],{'style':'heart','wish':'เขียนทับ','portrait':self.portrait()})
        self.assertEqual(response.status_code,409)
        self.assertEqual(Krathong.objects.count(),2)
        self.assertFalse(Krathong.objects.filter(wish='เขียนทับ').exists())

    def test_expired_pair_invite_is_readable_but_cannot_be_joined(self):
        state = self.new_pair()['pair']
        PairSession.objects.update(expires_at=timezone.now()-timedelta(seconds=1))
        guest = Client()
        self.assertEqual(guest.get(state['api_url']).json()['pair']['status'],'expired')
        self.assertEqual(guest.post(state['join_url'],{'style':'duck','wish':'ทดสอบ'}).status_code,410)
        self.assertFalse(PairSession.objects.get().guest_claimed)

    def test_pair_roundtrip_for_lanterns_and_invalid_invites(self):
        state = self.new_pair(kind='lantern')['pair']
        self.assertContains(Client().get(state['invite_url']),'โคมสีครีม')
        guest = Client()
        joined = guest.post(state['join_url'],{'style':'rose','wish':'เป็นคืนที่ดี','portrait':self.portrait()})
        self.assertEqual(joined.status_code,201)
        self.assertEqual(self.client.get('/api/lanterns/').json()['total'],0)
        self.client.post(state['ready_url'])
        guest.post(state['ready_url'])
        PairSession.objects.update(launch_at=timezone.now()-timedelta(seconds=1))
        self.assertEqual(self.client.get('/api/lanterns/').json()['total'],2)
        self.assertEqual(self.client.get('/api/krathongs/').json()['total'],0)
        self.assertEqual(self.client.get('/couple/missing-token/').status_code,404)

    def test_pair_feed_keeps_older_partner_together_with_new_guest(self):
        state = self.new_pair()['pair']
        host = Krathong.objects.get()
        Krathong.objects.filter(pk=host.pk).update(created_at=timezone.now()-timedelta(days=2))
        guest_response = Client().post(state['join_url'],{'style':'duck','wish':'ลอยด้วยกัน','portrait':self.portrait()})
        guest_id = guest_response.json()['krathong']['id']
        Krathong.objects.bulk_create([Krathong(wish=f'ขอให้สุขใจ {i}',style='lotus',x=50,y=60) for i in range(85)])
        Krathong.objects.filter(pk=guest_id).update(created_at=timezone.now()+timedelta(seconds=1))
        PairSession.objects.update(launch_at=timezone.now()-timedelta(seconds=1))
        feed = self.client.get('/api/krathongs/').json()
        ids = [item['id'] for item in feed['krathongs']]
        self.assertEqual(len(ids),80)
        self.assertIn(str(host.pk),ids)
        self.assertIn(guest_id,ids)
        self.assertEqual(feed['total'],87)

    def test_invite_join_still_requires_csrf_and_removed_copy_is_gone(self):
        state = self.new_pair()['pair']
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(client.post(state['join_url'],{'style':'duck','wish':'ทดสอบ'}).status_code,403)
        for page in ['/', '/lanterns/', state['invite_url']]:
            response = self.client.get(page)
            self.assertNotContains(response,'ไม่ต้องสมัครสมาชิก')
            self.assertNotContains(response,'ลอยได้ฟรี ไม่ต้องล็อกอิน')
            self.assertNotContains(response,'รูป ชื่อ และคำอธิษฐานจะแสดงให้ทุกคนเห็น')

    def test_unicode_and_special_characters_roundtrip(self):
        wish = 'ขอให้สุขใจ ✨ <script>alert("x")</script>'
        response = self.create(wish=wish)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.get('/api/krathongs/').json()['krathongs'][0]['wish'], wish)

    def test_lantern_scene_and_krathong_scene_have_separate_data(self):
        response = self.client.get('/lanterns/')
        self.assertContains(response, 'ปล่อยโคมขึ้นฟ้า')
        self.assertContains(response, 'Mattiw')
        self.create()
        response = self.client.post('/api/lanterns/', {'style':'paper','wish':'ขอให้ใจเบาลง'})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['krathong']['kind'], 'lantern')
        self.assertEqual(self.client.get('/api/lanterns/').json()['total'], 1)
        self.assertEqual(self.client.get('/api/krathongs/').json()['total'], 1)
        pk = response.json()['krathong']['id']
        self.assertEqual(self.client.get(f'/api/lanterns/{pk}/').status_code, 200)
        self.assertEqual(self.client.get(f'/api/krathongs/{pk}/').status_code, 404)

    def test_style_is_validated_for_each_scene(self):
        self.assertEqual(self.create(style='paper').status_code, 400)
        self.assertEqual(self.client.post('/api/lanterns/', {'style':'duck','wish':'มีความสุข'}).status_code, 400)
        for style in ['duck','heart']:
            self.assertEqual(self.create(style=style).status_code, 201)
        for style in ['paper','rose','sky']:
            self.assertEqual(self.client.post('/api/lanterns/', {'style':style,'wish':'ขอให้สุขใจ'}).status_code, 201)

    def test_all_eighteen_visible_krathongs_can_be_floated(self):
        page = self.client.get('/')
        styles = page.context['styles']
        self.assertEqual(len(styles), 18)
        for index, style in enumerate(styles):
            with self.subTest(style=style['value']):
                response = self.client.post('/api/krathongs/', {
                    'style': style['value'], 'wish': 'ขอให้เป็นวันที่ดี', 'name': 'ทดสอบแบบกระทง',
                }, REMOTE_ADDR=f'192.0.2.{index + 1}')
                self.assertEqual(response.status_code, 201)
                item = response.json()['krathong']
                self.assertEqual(item['style'], style['value'])
                self.assertEqual(self.client.get(f'/api/krathongs/{item["id"]}/').json()['krathong']['style'], style['value'])
        self.assertEqual(Krathong.objects.count(), 18)

    def test_active_custom_design_can_be_selected(self):
        design = FloatingDesign.objects.create(name='กระทงน้องแมว', image='designs/cat.png')
        self.assertContains(self.client.get('/'), 'กระทงน้องแมว')
        response = self.create(style='custom',design=str(design.pk))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['krathong']['design']['image'], '/media/designs/cat.png')
        self.assertEqual(Krathong.objects.get().design, design)

    def test_hidden_missing_or_wrong_scene_designs_cannot_be_selected(self):
        design = FloatingDesign.objects.create(name='โคมลับ',kind='lantern',image='designs/lantern.png')
        self.assertEqual(self.create(style='custom',design=str(design.pk)).status_code, 400)
        self.assertEqual(self.create(style='custom').status_code, 400)
        design.kind = 'krathong'; design.is_active = False; design.save()
        self.assertEqual(self.create(style='custom',design=str(design.pk)).status_code, 400)
        self.assertNotContains(self.client.get('/'), 'โคมลับ')

    def test_admin_is_protected_and_public_pages_stay_anonymous(self):
        self.assertRedirects(self.client.get('/admin/'), '/admin/login/?next=/admin/')
        self.assertEqual(self.client.get('/').status_code, 200)
        self.assertEqual(self.client.get('/lanterns/').status_code, 200)
        staff = get_user_model().objects.create_superuser('testadmin', password='test-only-password')
        self.client.force_login(staff)
        dashboard = self.client.get('/admin/')
        self.assertContains(dashboard, 'เพลงประจำเว็บ')
        self.assertContains(dashboard, 'หลังบ้านของ Mattiw')
        self.assertContains(dashboard, 'mattiw-admin.css')
        self.assertEqual(self.client.get('/admin/pond/backgroundmusic/add/').status_code, 200)
        self.assertEqual(self.client.get('/admin/pond/floatingdesign/add/').status_code, 200)

    def test_mattiw_welcome_is_available_on_both_scenes_and_admin_has_its_own_theme(self):
        for page in ['/', '/lanterns/']:
            response = self.client.get(page)
            self.assertContains(response, 'id="mattiw-welcome"')
            self.assertContains(response, 'mattiw-cat.svg')
            self.assertContains(response, 'welcome.js')
            self.assertContains(response, 'id="about-mattiw"')
        login = self.client.get('/admin/login/')
        self.assertEqual(login.status_code, 200)
        self.assertContains(login, 'Mattiw แมวส้มต้อนรับผู้ดูแล')
        self.assertContains(login, 'name="csrfmiddlewaretoken"')
        self.assertContains(login, 'name="username"')
        self.assertContains(login, 'name="password"')
        self.assertContains(login, 'mattiw-admin.css')
        self.assertNotContains(login, 'id="mattiw-welcome"')

    def test_uploaded_music_is_used_only_when_enabled(self):
        self.assertNotContains(self.client.get('/'), 'id="background-music"')
        song = BackgroundMusic.objects.create(title='ลอยกระทง เวอร์ชันของเรา',audio='music/loy.mp3')
        for page in ['/', '/lanterns/']:
            response = self.client.get(page)
            self.assertContains(response, 'ลอยกระทง เวอร์ชันของเรา')
            self.assertContains(response, 'src="/media/music/loy.mp3"')
        song.enabled = False; song.save()
        self.assertNotContains(self.client.get('/'), 'id="background-music"')

    def test_custom_design_admin_reencodes_image_with_transparency(self):
        original = Image.new('RGBA', (1200,1000), (230,180,220,100))
        output = BytesIO(); original.save(output, format='PNG')
        upload = SimpleUploadedFile('cat.png', output.getvalue(),content_type='image/png')
        form = FloatingDesignAdminForm(data={'name':'แมว','kind':'krathong','face_x':50,'face_y':40,'face_size':30,'order':0,'is_active':True},files={'image':upload})
        self.assertTrue(form.is_valid(), form.errors)
        design = form.save()
        with Image.open(design.image.path) as saved:
            self.assertEqual(saved.format, 'PNG')
            self.assertEqual(saved.mode, 'RGBA')
            self.assertLessEqual(saved.width, 960)
            self.assertFalse(saved.getexif())

    def test_music_admin_rejects_invalid_extension_and_large_file(self):
        for filename, contents in [('bad.exe',b'not audio'),('large.mp3',b'x'*(30*1024*1024+1))]:
            upload = SimpleUploadedFile(filename,contents,content_type='application/octet-stream')
            form = BackgroundMusicAdminForm(data={'title':'เพลงลอยกระทง','enabled':True},files={'audio':upload})
            self.assertFalse(form.is_valid())
            self.assertIn('audio',form.errors)

    def test_admin_music_upload_is_saved_and_available_on_both_pages(self):
        stream = BytesIO()
        with wave.open(stream, 'wb') as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(8000)
            wav.writeframes(b'\x00\x00' * 800)
        audio = SimpleUploadedFile('festival.wav',stream.getvalue(),content_type='audio/wav')
        staff = get_user_model().objects.create_superuser('musicadmin',password='test-only-password')
        self.client.force_login(staff)
        response = self.client.post('/admin/pond/backgroundmusic/add/',{'title':'เพลงคืนนี้','audio':audio,'enabled':'on','_save':'Save'})
        self.assertEqual(response.status_code, 302)
        song = BackgroundMusic.objects.get()
        self.assertEqual(song.audio.size,len(stream.getvalue()))
        self.client.logout()
        for page in ['/', '/lanterns/']:
            self.assertContains(self.client.get(page), song.audio.url)


class DeploymentTests(TestCase):
    """Render free tier: uploads live in the database, IPs come from the proxy."""

    def test_database_storage_keeps_uploads_and_card_still_renders(self):
        from django.core.files.base import ContentFile
        from django.test import RequestFactory
        from .storage import DatabaseStorage
        from .models import StoredFile
        from .views import stored_media
        from .artwork import item_art_svg
        storage = DatabaseStorage()
        stream = BytesIO(); Image.new('RGB', (64, 64), '#cc8855').save(stream, format='JPEG')
        name = storage.save('portraits/2026/11/face.jpg', ContentFile(stream.getvalue()))
        self.assertTrue(storage.exists(name))
        self.assertEqual(storage.size(name), len(stream.getvalue()))
        self.assertEqual(storage.url(name), '/media/portraits/2026/11/face.jpg')
        self.assertNotEqual(storage.save('portraits/2026/11/face.jpg', ContentFile(b'x')), name)
        with storage.open(name) as handle:
            self.assertEqual(handle.read(), stream.getvalue())
        response = stored_media(RequestFactory().get('/media/x'), name)
        self.assertEqual(response['Content-Type'], 'image/jpeg')
        self.assertEqual(response.content, stream.getvalue())
        item = Krathong(name='ทดสอบ', wish='ขอให้สุขใจ', style='lotus', x=50, y=50)
        item.portrait.storage = storage
        item.portrait.name = name
        self.assertIn('data:image/jpeg;base64,', item_art_svg(item))
        storage.delete(name)
        self.assertFalse(StoredFile.objects.filter(name=name).exists())

    def test_rate_limit_uses_forwarded_client_ip_behind_proxy(self):
        from django.test import RequestFactory
        from .views import client_ip
        request = RequestFactory().get('/', REMOTE_ADDR='10.0.0.1', HTTP_X_FORWARDED_FOR='1.1.1.1, 203.0.113.9')
        self.assertEqual(client_ip(request), '10.0.0.1')
        with override_settings(BEHIND_PROXY=True):
            self.assertEqual(client_ip(request), '203.0.113.9')
            request.META['HTTP_CF_CONNECTING_IP'] = '198.51.100.7'
            self.assertEqual(client_ip(request), '198.51.100.7')
