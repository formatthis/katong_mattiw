import uuid
import warnings
from io import BytesIO
from PIL import Image, ImageOps, UnidentifiedImageError
from django import forms
from django.core.files.base import ContentFile
from .models import Krathong, FloatingDesign, BackgroundMusic
from .artwork import normalize_appearance

STYLES = {
    'krathong': [
        ('lotus', 'บัวชมพู'), ('banana', 'ใบตอง'), ('gold', 'บัวทอง'),
        ('marigold', 'ดาวเรือง'), ('boat', 'เรือ'),
        ('duck', 'เป็ดเหลือง'), ('swan', 'หงส์'), ('turtle', 'เต่า'),
        ('cat', 'แมว'), ('rabbit', 'กระต่าย'), ('panda', 'แพนด้า'), ('capybara', 'คาปิบารา'),
        ('watermelon', 'แตงโม'), ('coconut', 'กะลามะพร้าว'), ('bread', 'ขนมปัง'),
        ('heart', 'หัวใจ'), ('moon', 'พระจันทร์'), ('star', 'ดาว'),
    ],
    'lantern': [('paper', 'โคมสีครีม'), ('rose', 'โคมสีชมพู'), ('sky', 'โคมสีฟ้า')],
}

STYLE_CATEGORIES = {
    **dict.fromkeys(['lotus', 'banana', 'gold', 'marigold', 'boat'], 'classic'),
    **dict.fromkeys(['duck', 'swan', 'turtle', 'cat', 'rabbit', 'panda', 'capybara'], 'animals'),
    **dict.fromkeys(['watermelon', 'coconut', 'bread'], 'food'),
    **dict.fromkeys(['heart', 'moon', 'star'], 'other'),
}

class KrathongForm(forms.Form):
    name = forms.CharField(max_length=40, required=False)
    wish = forms.CharField(max_length=280, min_length=1)
    style = forms.ChoiceField(choices=Krathong.Style.choices)
    portrait = forms.FileField(required=False)
    website = forms.CharField(required=False, widget=forms.HiddenInput)
    design = forms.ModelChoiceField(queryset=FloatingDesign.objects.none(), required=False)
    mode = forms.ChoiceField(choices=[('solo', 'ลอยเดี่ยว'), ('couple', 'ลอยเป็นคู่')], required=False)
    appearance = forms.JSONField(required=False)

    def clean_appearance(self):
        return normalize_appearance(self.cleaned_data.get('appearance'))

    def __init__(self, *args, kind='krathong', require_portrait=False, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['style'].choices = STYLES[kind] + [('custom', 'แบบพิเศษ')]
        self.fields['design'].queryset = FloatingDesign.objects.filter(kind=kind, is_active=True)
        self.fields['portrait'].required = require_portrait
        self.fields['portrait'].error_messages['required'] = 'ใส่รูปของเราก่อนลอยคู่ด้วยนะ'

    def clean_mode(self):
        return self.cleaned_data['mode'] or 'solo'

    def clean(self):
        data = super().clean()
        if data.get('style') == 'custom' and not data.get('design'):
            self.add_error('design', 'แบบนี้ยังไม่พร้อม ลองเลือกแบบอื่นก่อนนะ')
        if data.get('style') != 'custom':
            data['design'] = None
        elif data.get('appearance'):
            self.add_error('appearance', 'เลือกรูปแบบกระทงสำหรับแต่งเองก่อนนะ')
        return data

    def clean_name(self):
        return self.cleaned_data['name'].strip() or 'ผู้ร่วมอธิษฐาน'

    def clean_website(self):
        if self.cleaned_data['website']:
            raise forms.ValidationError('ไม่สามารถส่งคำอธิษฐานนี้ได้')
        return ''

    def clean_portrait(self):
        upload = self.cleaned_data.get('portrait')
        if not upload:
            return None
        if upload.size > 5 * 1024 * 1024:
            raise forms.ValidationError('รูปภาพต้องมีขนาดไม่เกิน 5 MB')
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(upload) as original:
                    if original.format not in ('JPEG', 'PNG', 'WEBP'):
                        raise forms.ValidationError('กรุณาใช้รูป JPG, PNG หรือ WEBP')
                    if original.width * original.height > 20_000_000:
                        raise forms.ValidationError('รูปภาพมีขนาดใหญ่เกินไป กรุณาย่อรูปก่อน')
                    original.load()
                    picture = ImageOps.exif_transpose(original).convert('RGB')
                    picture = ImageOps.fit(picture, (480, 480), Image.Resampling.LANCZOS)
                    output = BytesIO()
                    picture.save(output, format='JPEG', quality=88)
            return ContentFile(output.getvalue(), name=f'{uuid.uuid4().hex}.jpg')
        except (UnidentifiedImageError, OSError, ValueError,
                Image.DecompressionBombWarning, Image.DecompressionBombError):
            raise forms.ValidationError('ไฟล์นี้ไม่ใช่รูปภาพที่รองรับ หรือรูปภาพเสียหาย')


class FloatingDesignAdminForm(forms.ModelForm):
    class Meta:
        model = FloatingDesign
        fields = '__all__'

    def clean_image(self):
        image = self.cleaned_data.get('image')
        if not image or not hasattr(image, 'content_type'):
            return image
        if image.size > 5 * 1024 * 1024:
            raise forms.ValidationError('ภาพต้องมีขนาดไม่เกิน 5 MB')
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(image) as original:
                    if original.width * original.height > 20_000_000:
                        raise forms.ValidationError('รูปต้องมีขนาดไม่เกิน 20 ล้านพิกเซล')
                    original.load()
                    picture = ImageOps.exif_transpose(original).convert('RGBA')
                    picture.thumbnail((960, 800), Image.Resampling.LANCZOS)
                    output = BytesIO()
                    picture.save(output, format='PNG')
            return ContentFile(output.getvalue(), name=f'{uuid.uuid4().hex}.png')
        except (OSError, ValueError, Image.DecompressionBombWarning, Image.DecompressionBombError):
            raise forms.ValidationError('เปิดรูปนี้ไม่ได้ ลองใช้ PNG หรือ WEBP ใหม่')


class BackgroundMusicAdminForm(forms.ModelForm):
    class Meta:
        model = BackgroundMusic
        fields = '__all__'

    def clean_audio(self):
        audio = self.cleaned_data.get('audio')
        if audio and audio.size > 30 * 1024 * 1024:
            raise forms.ValidationError('เพลงต้องมีขนาดไม่เกิน 30 MB')
        return audio
