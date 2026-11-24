from django.contrib import admin
from django.utils.html import format_html
from .models import BackgroundMusic, FloatingDesign, Krathong, PairSession
from .forms import BackgroundMusicAdminForm, FloatingDesignAdminForm

admin.site.site_header = 'Mattiw · หลังบ้านคืนลอย'
admin.site.site_title = 'Mattiw | คืนลอย'
admin.site.index_title = 'จัดการเว็บคืนลอย'
admin.site.index_template = 'admin/mattiw_index.html'

@admin.register(BackgroundMusic)
class BackgroundMusicAdmin(admin.ModelAdmin):
    form = BackgroundMusicAdminForm
    list_display = ['title', 'enabled', 'listen']

    def has_add_permission(self, request):
        return super().has_add_permission(request) and not BackgroundMusic.objects.exists()

    @admin.display(description='ฟังเพลงตัวอย่าง')
    def listen(self, obj):
        return format_html('<audio controls preload="none" src="{}"></audio>', obj.audio.url) if obj.audio else '—'

@admin.register(FloatingDesign)
class FloatingDesignAdmin(admin.ModelAdmin):
    form = FloatingDesignAdminForm
    list_display = ['name', 'kind', 'preview', 'is_active', 'order']
    list_filter = ['kind', 'is_active']
    list_editable = ['is_active', 'order']
    readonly_fields = ['preview']
    fieldsets = [
        (None, {'fields': ['name', 'kind', 'image', 'preview', 'is_active', 'order']}),
        ('วางรูปใบหน้าบนวัตถุ', {'fields': ['face_x', 'face_y', 'face_size'], 'description': 'ตำแหน่งคิดเป็นเปอร์เซ็นต์ของภาพ จุดกึ่งกลาง 50, 50 ปรับให้เข้ากับพื้นที่ว่างบนกระทงหรือโคม'}),
    ]

    @admin.display(description='ตัวอย่างวัตถุ')
    def preview(self, obj):
        return format_html('<img src="{}" alt="" style="width:120px;height:100px;object-fit:contain;background:#12312d;border-radius:8px">', obj.image.url) if obj and obj.image else '—'

@admin.register(Krathong)
class KrathongAdmin(admin.ModelAdmin):
    list_display = ['name', 'kind', 'style', 'pair_slot', 'wish', 'created_at']
    list_filter = ['kind', 'style', 'pair_slot', 'created_at']
    search_fields = ['name', 'wish']
    readonly_fields = ['id', 'created_at', 'appearance']


@admin.register(PairSession)
class PairSessionAdmin(admin.ModelAdmin):
    list_display = ['id', 'kind', 'guest_claimed', 'created_at', 'expires_at']
    readonly_fields = ['id', 'invite_token', 'kind', 'x', 'y', 'guest_claimed', 'created_at']
    list_filter = ['kind', 'guest_claimed']

    def has_add_permission(self, request):
        return False
