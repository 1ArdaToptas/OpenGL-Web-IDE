---
name: opengl-native-development
description: Use when writing, building, running or debugging native C/C++ OpenGL code in this project - legacy/compatibility OpenGL (glBegin, FreeGLUT, GLU), modern core OpenGL (GLFW, GLAD/GLEW, GLSL, VAO/VBO/EBO), MinGW-w64/GCC/CMake on Windows, OpenGL context/profile issues, compile/link/runtime errors, or the project's build templates. Not for React/frontend or generic Python backend work.
---

# OpenGL Native Development

Bu proje kullanıcının C/C++ OpenGL kodunu Windows'ta MinGW-w64 (MSYS2 UCRT64) + CMake ile derleyip yerel GPU'da çalıştırır.

## Temel kurallar

1. **İki profil, iki şablon — asla karıştırma.**
   - `legacy`: FreeGLUT + GLU, compatibility profile. `glBegin/glEnd`, matris yığını, `glutTimerFunc`.
   - `modern`: GLFW + GLAD, **3.3 core profile**. Shader, VAO/VBO/EBO. Immediate mode çağrıları core'da GL_INVALID_OPERATION üretir.
   - Profil kullanıcı kodundan tahmin edilmez; proje oluşturulurken seçilir ve şablonun `CMakeLists.txt`'i ona göre üretilir.
2. **CMakeLists.txt kullanıcı tarafından düzenlenemez** (CMake `execute_process` ile keyfi komut çalıştırabilir). Motor üretir.
3. Derleyici/linker çağrıları her zaman **argüman listesi** ile, `shell=False`. Kullanıcı serbest bayrak giremez; yalnızca beyaz listedeki seçenekler.
4. Hibrit GPU (bu makinede AMD iGPU + NVIDIA RTX 3050 Ti): şablonlar `NvOptimusEnablement` / `AmdPowerXpressRequestHighPerformance` export eder. Çalıştırmada `GL_RENDERER` loglanır.
5. Çalışan programın stdout'u pipe'a gider → şablonlar `setvbuf(stdout, NULL, _IONBF, 0)` çağırır.
6. Hata ayıklarken önce sınıflandır: derleme (gcc) / link (eksik `-l`, sıra) / çalışma (eksik DLL, context oluşturulamadı, GL hatası).

## Referanslar (yalnızca gerektiğinde oku)

| Konu | Dosya |
|---|---|
| Toolchain kurulumu, MSYS2 paketleri, CMake, DLL dağıtımı | `references/toolchain-windows.md` |
| Legacy OpenGL + FreeGLUT/GLU şablonu ve API notları | `references/legacy-freeglut.md` |
| Modern OpenGL + GLFW/GLAD, shader, buffer şablonu | `references/modern-glfw.md` |
| Sık hatalar ve çözümleri | `references/troubleshooting.md` |
