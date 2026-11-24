"""Keep uploaded media (portraits, designs, music) inside the database.

Render's free web service has an ephemeral disk: anything written to ./media is lost
on every deploy or when the instance sleeps. Storing the bytes next to the rows in
Postgres keeps uploads alive with no extra storage account.
"""
import mimetypes
from urllib.parse import quote
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible


@deconstructible
class DatabaseStorage(Storage):
    def _model(self):
        from .models import StoredFile
        return StoredFile

    def _open(self, name, mode='rb'):
        row = self._model().objects.filter(name=name).only('content').first()
        if row is None:
            raise FileNotFoundError(name)
        return ContentFile(bytes(row.content), name=name)

    def _save(self, name, content):
        if hasattr(content, 'seek'):
            content.seek(0)
        data = content.read()
        if isinstance(data, str):
            data = data.encode()
        content_type = getattr(content, 'content_type', None) or mimetypes.guess_type(name)[0] or 'application/octet-stream'
        self._model().objects.create(name=name, content=data, size=len(data), content_type=content_type)
        return name

    def exists(self, name):
        return self._model().objects.filter(name=name).exists()

    def delete(self, name):
        self._model().objects.filter(name=name).delete()

    def size(self, name):
        row = self._model().objects.filter(name=name).only('size').first()
        if row is None:
            raise FileNotFoundError(name)
        return row.size

    def url(self, name):
        return settings.MEDIA_URL + quote(name.replace('\\', '/'))

    def path(self, name):
        raise NotImplementedError('Files in the database have no local path.')
