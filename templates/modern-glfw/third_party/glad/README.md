# GLAD 2 (vendored)

glad 2.0.8 ile üretildi. Elle düzenleme; gerekirse yeniden üret:

```
python -m pip install glad2==2.0.8
python -m glad --api gl:core=3.3 --extensions GL_KHR_debug,GL_ARB_debug_output --reproducible --out-path . c
```

Lisans: üretilen kod Khronos spesifikasyonundan türetilmiştir (Apache-2.0); `KHR/khrplatform.h` MIT-benzeri Khronos lisansı (dosya başlığı); glad üreticisi MIT. Ayrıntı: https://github.com/Dav1dde/glad#license
