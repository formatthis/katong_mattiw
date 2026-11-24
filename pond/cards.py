import base64
import hashlib
import json
import unicodedata
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
from PIL import ImageFont
import resvg_py
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from .artwork import item_art_svg


@lru_cache(maxsize=1)
def background_data():
    data = (Path(settings.BASE_DIR) / 'static/pond/thai-temple-night.png').read_bytes()
    return 'data:image/png;base64,' + base64.b64encode(data).decode('ascii')


@lru_cache(maxsize=30)
def font(size, bold=False):
    filename = 'Sarabun-SemiBold.ttf' if bold else 'Sarabun-Regular.ttf'
    return ImageFont.truetype(str(Path(settings.BASE_DIR) / 'static/pond/fonts' / filename), size)


def text_lines(text, size, max_width):
    # Preserve every word while normalizing repeated line breaks for a printable card.
    text = ' '.join(text.split())
    clusters = []
    for char in text:
        if unicodedata.category(char).startswith('M') and clusters:
            clusters[-1] += char
        else:
            clusters.append(char)
    lines, current = [], ''
    for cluster in clusters:
        if current and font(size).getlength(current + cluster) > max_width:
            lines.append(current.rstrip()); current = cluster.lstrip()
        else:
            current += cluster
    if current:
        lines.append(current.rstrip())
    return lines or ['']


def card_svg(item, layout='post'):
    story = layout == 'story'
    width, height = 1080, 1920 if story else 1350
    name_y, wish_y, max_text = (1050, 1150, 530) if story else (817, 901, 303)
    name_size = 46
    while name_size > 26 and font(name_size, True).getlength(item.name) > 840:
        name_size -= 2
    size = 44
    while True:
        lines = text_lines(item.wish, size, 820)
        line_height = int(size * 1.55)
        if len(lines) * line_height <= max_text or size <= 22:
            break
        size -= 2
    actual_height = max(0, (len(lines)-1)*line_height)
    first_y = wish_y + max(0,(max_text-actual_height-size)/2)
    words = ''.join(f'<text x="540" y="{first_y+i*line_height}" font-size="{size}" text-anchor="middle" fill="#f0e8d5">{escape(line)}</text>' for i,line in enumerate(lines))
    art = item_art_svg(item)
    art_y, art_size = (270, 760) if story else (205, 660)
    art = art.replace('<svg ', f'<svg x="{(1080-art_size)/2}" y="{art_y}" width="{art_size}" height="{art_size/1.2}" ', 1)
    created = timezone.localtime(item.created_at)
    months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
    date = f'{created.day} {months[created.month-1]} {created.year+543}'
    object_name = 'โคม' if item.kind == 'lantern' else 'กระทง'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<defs><linearGradient id="shade" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#031c2a" stop-opacity=".5"/><stop offset=".5" stop-color="#06252b" stop-opacity=".7"/><stop offset=".67" stop-color="#082d30"/><stop offset="1" stop-color="#071f25"/></linearGradient><radialGradient id="glow"><stop stop-color="#f5d38c" stop-opacity=".22"/><stop offset="1" stop-color="#f5d38c" stop-opacity="0"/></radialGradient></defs>
<rect width="1080" height="{height}" fill="#08282d"/>
<image href="{background_data()}" width="1080" height="{height}" preserveAspectRatio="xMidYMid slice"/>
<rect width="1080" height="{height}" fill="url(#shade)"/>
<rect x="38" y="38" width="1004" height="{height-76}" rx="39" fill="none" stroke="#e9cf98" stroke-opacity=".65" stroke-width="2"/>
<rect x="51" y="51" width="978" height="{height-102}" rx="29" fill="none" stroke="#e9cf98" stroke-opacity=".16"/>
<g font-family="Sarabun"><text x="540" y="{160 if story else 127}" font-size="48" font-weight="600" text-anchor="middle" fill="#f2d49d">คืนลอย</text>
<text x="540" y="{214 if story else 179}" font-size="25" text-anchor="middle" fill="#d9deca">{object_name}ของเรา กับคำอธิษฐานในคืนนี้</text>
<ellipse cx="540" cy="{780 if story else 632}" rx="340" ry="140" fill="url(#glow)"/>
{art}
<path d="M310 {name_y-70}H475m130 0h165" stroke="#d8bf89" stroke-opacity=".55"/><path d="m540 {name_y-81} 7 11-7 11-7-11Z" fill="#d8bf89"/>
<text x="540" y="{name_y}" font-size="{name_size}" font-weight="600" text-anchor="middle" fill="#f0d6a2">{escape(item.name)}</text>
<text x="540" y="{name_y+43}" font-size="22" text-anchor="middle" fill="#adc2b0">{date}</text>
{words}
<path d="M330 {height-127}H750" stroke="#bfa775" stroke-opacity=".3"/>
<text x="540" y="{height-82}" font-size="23" text-anchor="middle" fill="#d7bd8a">สร้างโดย mattiw · conne</text></g></svg>'''


def render_card(item, layout='post'):
    digest = hashlib.sha256(json.dumps(item.as_dict(),sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:20]
    key = f'card:v1:{item.pk}:{layout}:{digest}'
    cached = cache.get(key)
    if cached:
        return cached
    fonts = Path(settings.BASE_DIR) / 'static/pond/fonts'
    result = resvg_py.svg_to_bytes(svg_string=card_svg(item,layout), width=1080, height=1920 if layout == 'story' else 1350,
                                   font_files=[str(fonts/'Sarabun-Regular.ttf'),str(fonts/'Sarabun-SemiBold.ttf')],font_family='Sarabun')
    cache.set(key,result,timeout=300)
    return result
