from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pond', '0006_pairsession_launch_together'),
    ]

    operations = [
        migrations.CreateModel(
            name='StoredFile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255, unique=True)),
                ('content', models.BinaryField()),
                ('content_type', models.CharField(default='application/octet-stream', max_length=100)),
                ('size', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'ไฟล์ที่อัปโหลด',
                'verbose_name_plural': 'ไฟล์ที่อัปโหลด',
            },
        ),
    ]
