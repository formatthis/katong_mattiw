import uuid
import secrets
from datetime import timedelta
from django.db import models
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator, FileExtensionValidator


class FloatingDesign(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField('ชื่อแบบ', max_length=40)
    kind = models.CharField('ใช้กับ', max_length=10, choices=[('krathong', 'กระทง'), ('lantern', 'โคมลอย')], default='krathong')
    image = models.ImageField('ภาพวัตถุ', upload_to='designs/', help_text='PNG/WEBP พื้นหลังโปร่งใสจะสวยที่สุด สูงสุด 5 MB')
    face_x = models.PositiveSmallIntegerField('ตำแหน่งใบหน้าแนวนอน (%)', default=50, validators=[MinValueValidator(10), MaxValueValidator(90)])
    face_y = models.PositiveSmallIntegerField('ตำแหน่งใบหน้าแนวตั้ง (%)', default=42, validators=[MinValueValidator(10), MaxValueValidator(90)])
    face_size = models.PositiveSmallIntegerField('ขนาดใบหน้า (%)', default=30, validators=[MinValueValidator(12), MaxValueValidator(55)])
    is_active = models.BooleanField('เปิดให้เลือก', default=True)
    order = models.PositiveSmallIntegerField('ลำดับแสดง', default=0)

    class Meta:
        ordering = ['order', 'name']
        verbose_name = 'แบบกระทง / โคม'
        verbose_name_plural = 'แบบกระทง / โคม'

    def __str__(self):
        return self.name

    def as_dict(self):
        return {'id': str(self.pk), 'name': self.name, 'image': self.image.url,
                'face_x': self.face_x, 'face_y': self.face_y, 'face_size': self.face_size}


class BackgroundMusic(models.Model):
    title = models.CharField('ชื่อเพลง', max_length=100, default='ลอยกระทง')
    audio = models.FileField('ไฟล์เพลง', upload_to='music/', validators=[FileExtensionValidator(['mp3', 'wav', 'ogg', 'm4a'])], help_text='อัปโหลดเพลงลอยกระทงหรือเพลงที่มีสิทธิ์ใช้ MP3, WAV, OGG, M4A สูงสุด 30 MB')
    enabled = models.BooleanField('เปิดใช้งานเพลง', default=True)

    class Meta:
        verbose_name = 'เพลงประจำเว็บ'
        verbose_name_plural = 'เพลงประจำเว็บ'

    def __str__(self):
        return self.title

class StoredFile(models.Model):
    """Uploaded media bytes, used when MEDIA is stored in the database (e.g. on Render)."""
    name = models.CharField(max_length=255, unique=True)
    content = models.BinaryField()
    content_type = models.CharField(max_length=100, default='application/octet-stream')
    size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'ไฟล์ที่อัปโหลด'
        verbose_name_plural = 'ไฟล์ที่อัปโหลด'

    def __str__(self):
        return self.name


def pair_invite_token():
    return secrets.token_urlsafe(32)


def pair_invite_expiry():
    return timezone.now() + timedelta(days=7)


class PairSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invite_token = models.CharField(max_length=64, unique=True, default=pair_invite_token, editable=False)
    kind = models.CharField(max_length=10, choices=[('krathong', 'กระทง'), ('lantern', 'โคมลอย')], default='krathong')
    x = models.FloatField()
    y = models.FloatField()
    guest_claimed = models.BooleanField(default=False)
    # Both people press "float together"; the room launches at a shared moment.
    host_ready_at = models.DateTimeField(blank=True, null=True)
    guest_ready_at = models.DateTimeField(blank=True, null=True)
    launch_at = models.DateTimeField('เวลาลอยพร้อมกัน', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=pair_invite_expiry)

    class Meta:
        verbose_name = 'รอบลอยคู่'
        verbose_name_plural = 'รอบลอยคู่'

    def __str__(self):
        return f'ลอยคู่ {self.pk}'


class Krathong(models.Model):
    class Style(models.TextChoices):
        LOTUS = 'lotus', 'บัวชมพู'
        BANANA = 'banana', 'ใบตอง'
        GOLD = 'gold', 'บัวทอง'
        DUCK = 'duck', 'เป็ดเหลือง'
        HEART = 'heart', 'หัวใจ'
        MARIGOLD = 'marigold', 'ดาวเรือง'
        SWAN = 'swan', 'หงส์'
        TURTLE = 'turtle', 'เต่า'
        CAT = 'cat', 'แมว'
        RABBIT = 'rabbit', 'กระต่าย'
        PANDA = 'panda', 'แพนด้า'
        CAPYBARA = 'capybara', 'คาปิบารา'
        WATERMELON = 'watermelon', 'แตงโม'
        COCONUT = 'coconut', 'กะลามะพร้าว'
        BREAD = 'bread', 'ขนมปัง'
        MOON = 'moon', 'พระจันทร์'
        STAR = 'star', 'ดาว'
        BOAT = 'boat', 'เรือ'
        PAPER = 'paper', 'โคมอุ่นใจ'
        ROSE = 'rose', 'โคมชมพู'
        SKY = 'sky', 'โคมฟ้า'
        CUSTOM = 'custom', 'แบบพิเศษ'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=40, default='ผู้ร่วมอธิษฐาน')
    wish = models.CharField(max_length=280)
    style = models.CharField(max_length=10, choices=Style.choices, default=Style.LOTUS)
    kind = models.CharField('ประเภท', max_length=10, choices=[('krathong', 'กระทง'), ('lantern', 'โคมลอย')], default='krathong', db_index=True)
    design = models.ForeignKey(FloatingDesign, on_delete=models.SET_NULL, blank=True, null=True, verbose_name='แบบพิเศษ')
    pair_session = models.ForeignKey(PairSession, on_delete=models.SET_NULL, related_name='participants', blank=True, null=True, verbose_name='รอบลอยคู่')
    pair_slot = models.PositiveSmallIntegerField(choices=[(1, 'คนชวน'), (2, 'คู่ที่เข้าร่วม')], blank=True, null=True)
    portrait = models.ImageField(upload_to='portraits/%Y/%m/', blank=True)
    appearance = models.JSONField('การแต่งกระทง', default=dict, blank=True)
    x = models.FloatField()
    y = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']
        verbose_name = 'คำอธิษฐาน'
        verbose_name_plural = 'คำอธิษฐาน'
        constraints = [models.UniqueConstraint(fields=['pair_session', 'pair_slot'], name='one_participant_per_pair_slot')]

    def __str__(self):
        return f'{self.name}: {self.wish[:35]}'

    def as_dict(self):
        return {
            'id': str(self.pk), 'name': self.name, 'wish': self.wish,
            'style': self.style, 'portrait': self.portrait.url if self.portrait else None,
            'x': self.x, 'y': self.y, 'created_at': self.created_at.isoformat(),
            'kind': self.kind, 'design': self.design.as_dict() if self.design else None,
            'pair_id': str(self.pair_session_id) if self.pair_session_id else None,
            'pair_slot': self.pair_slot,
            'appearance': self.appearance,
        }
