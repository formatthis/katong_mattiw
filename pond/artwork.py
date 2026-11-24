import base64
import json
import re
from functools import lru_cache
from pathlib import Path
from django.conf import settings
from django.core.exceptions import ValidationError


@lru_cache(maxsize=1)
def art_catalog():
    return json.loads((Path(settings.BASE_DIR) / 'static/pond/art-catalog.json').read_text(encoding='utf-8'))


def normalize_appearance(value):
    if not value:
        return {}
    if not isinstance(value, dict):
        raise ValidationError('ข้อมูลแต่งกระทงไม่ถูกต้อง')
    defaults = art_catalog()['studio']['defaults']
    if set(value) - set(defaults):
        raise ValidationError('มีตัวเลือกแต่งกระทงที่ไม่รองรับ')
    if not isinstance(value.get('enabled', False), bool):
        raise ValidationError('โหมดแต่งกระทงไม่ถูกต้อง')
    if not value.get('enabled'):
        return {}
    result = {**defaults, **value}
    for key in ['color', 'leaf_color', 'candle_color']:
        if not isinstance(result[key], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', result[key]):
            raise ValidationError('กรุณาเลือกสีที่รองรับ')
        result[key] = result[key].lower()
    if not isinstance(result['leaf'], str) or result['leaf'] not in art_catalog()['studio']['leaf_shapes']:
        raise ValidationError('เลือกแบบใบตองอีกครั้ง')
    if not isinstance(result['decoration'], str) or result['decoration'] not in art_catalog()['studio']['decorations']:
        raise ValidationError('เลือกของตกแต่งอีกครั้ง')
    for key, choices in [('candles', [0, 1, 2, 3]), ('incense', [0, 1, 3])]:
        if type(result[key]) is not int or result[key] not in choices:
            raise ValidationError('จำนวนธูปหรือเทียนไม่ถูกต้อง')
    return result


def artwork_spec(style, appearance=None):
    catalog = art_catalog()
    config = normalize_appearance(appearance)
    if not config:
        return catalog['styles'].get(style, catalog['styles']['lotus'])
    studio = catalog['studio']
    if style in ('paper', 'rose', 'sky'):
        parts = [studio['lantern']]
        face = {'face_x': 50, 'face_y': 41, 'face_size': 29}
    else:
        parts = [studio['base'], studio['leaf_shapes'][config['leaf']], studio['incense'][str(config['incense'])],
                 studio['candles'][str(config['candles'])], studio['front'], studio['decorations'][config['decoration']]]
        face = {'face_x': 50, 'face_y': 61, 'face_size': 26}
    body = ''.join(parts)
    for key in ['color', 'leaf_color', 'candle_color']:
        body = body.replace('{' + key + '}', config[key])
    return {'svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100" fill="none" stroke="none">' + body + '</svg>', 'face': face}


def image_data(field):
    if not field:
        return None
    try:
        with field.open('rb') as handle:
            data = handle.read()
        media_type = 'image/png' if field.name.lower().endswith('.png') else 'image/webp' if field.name.lower().endswith('.webp') else 'image/jpeg'
        return f'data:{media_type};base64,' + base64.b64encode(data).decode('ascii')
    except (OSError, ValueError):
        return None


def item_art_svg(item):
    spec = artwork_spec(item.style, item.appearance)
    source = spec['svg']
    face = spec['face']
    if item.style == 'custom' and item.design:
        design_image = image_data(item.design.image)
        if design_image:
            source = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100"><image href="{design_image}" width="120" height="100" preserveAspectRatio="xMidYMid meet"/></svg>'
        face = {'face_x': item.design.face_x, 'face_y': item.design.face_y, 'face_size': item.design.face_size}
    portrait = image_data(item.portrait)
    if portrait:
        cx, cy = face['face_x'] * 1.2, face['face_y']
        size = face['face_size'] * 1.2
        clip_id = 'face-' + item.pk.hex
        photo = f'<defs><clipPath id="{clip_id}"><circle cx="{cx}" cy="{cy}" r="{size/2}"/></clipPath></defs><image href="{portrait}" x="{cx-size/2}" y="{cy-size/2}" width="{size}" height="{size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#{clip_id})"/><circle cx="{cx}" cy="{cy}" r="{size/2}" fill="none" stroke="#f1dab0" stroke-width="1.1"/>'
        source = source.replace('</svg>', photo + '</svg>')
    return source
