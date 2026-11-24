from django.db import migrations, models
from django.db.models import F


def keep_existing_rooms_visible(apps, schema_editor):
    # Rooms created before the shared countdown were already shown in the pond.
    PairSession = apps.get_model('pond', 'PairSession')
    PairSession.objects.filter(launch_at__isnull=True).update(launch_at=F('created_at'))


class Migration(migrations.Migration):

    dependencies = [
        ('pond', '0005_krathong_appearance'),
    ]

    operations = [
        migrations.AddField(
            model_name='pairsession',
            name='host_ready_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='pairsession',
            name='guest_ready_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='pairsession',
            name='launch_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='เวลาลอยพร้อมกัน'),
        ),
        migrations.RunPython(keep_existing_rooms_visible, migrations.RunPython.noop),
    ]
