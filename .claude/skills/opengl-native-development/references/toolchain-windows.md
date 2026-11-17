# Windows Native Toolchain

## Ortam (kurulu — `C:\msys64`, bkz. docs/DECISIONS.md ADR-009)

MSYS2 (UCRT64 ortamı). Yeniden kurulum gerekirse: `winget install MSYS2.MSYS2`, ardından MSYS2 UCRT64 kabuğunda (ntldd da kuruludur):

```
pacman -Syu
pacman -S --needed mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-gdb \
  mingw-w64-ucrt-x86_64-cmake mingw-w64-ucrt-x86_64-ninja mingw-w64-ucrt-x86_64-pkgconf \
  mingw-w64-ucrt-x86_64-freeglut mingw-w64-ucrt-x86_64-glfw mingw-w64-ucrt-x86_64-glew
```

GLAD: `glad2` üreticisiyle (gl 3.3 core) üretilen `glad.c` + başlıklar `templates/modern-glfw/third_party/glad/` altına vendorlanır. Paket adlarını kurulumda `pacman -Ss` ile doğrula.

## Toolchain tespiti (motor)

Motor, sabit konfigürasyondaki tam yolları kullanır (`PATH` aramasına güvenmez):
`<MSYS2>/ucrt64/bin/{gcc,g++,cmake,ninja}.exe`. Başlangıçta `--version` ile doğrulanır; başarısızsa build endpoint'i "toolchain yok" hatası döner.

## CMake çağrısı

```
cmake -S <proj> -B <proj>/build -G Ninja -DCMAKE_BUILD_TYPE=Debug \
      -DCMAKE_C_COMPILER=<gcc> -DCMAKE_CXX_COMPILER=<g++> -DCMAKE_MAKE_PROGRAM=<ninja>
cmake --build <proj>/build --parallel
```

## Link sırası

- Legacy: `freeglut glu32 opengl32` (+ `winmm gdi32` gerekebilir).
- Modern: `glfw3 opengl32` (+ glad kaynak olarak derlenir). GLEW seçilirse `glew32` ve `glewInit()` context'ten **sonra**.

## Çalışma zamanı DLL'leri

UCRT64 ikilileri `libgcc_s_seh-1.dll`, `libstdc++-6.dll`, `libwinpthread-1.dll`, `libfreeglut.dll`, `glfw3.dll` ister. Karar (ADR-011): çalıştırırken **yalnızca alt sürecin** `PATH` başına `<MSYS2>/ucrt64/bin` eklenir; statik link yok. Eksik DLL şüphesinde `ntldd -R <exe>` ile doğrula.

## Konsol

Varsayılan console subsystem kullanılır (stdout/stderr yakalanabilsin). `-mwindows` kullanma.
