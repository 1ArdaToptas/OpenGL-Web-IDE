# Her iki profil için ortak ayarlar. Değerler motordan -D ile gelir ve burada yeniden doğrulanır.
set(OGLIDE_PROJECT_DIR "${CMAKE_CURRENT_SOURCE_DIR}" CACHE PATH "Kullanıcı proje dizini")
set(OGLIDE_C_STD 17 CACHE STRING "C standardı")
set(OGLIDE_CXX_STD 17 CACHE STRING "C++ standardı")
set(OGLIDE_WARNINGS extra CACHE STRING "Uyarı seviyesi")

function(oglide_require var)
  if(NOT "${${var}}" IN_LIST ARGN)
    message(FATAL_ERROR "${var}=${${var}} izinli değil (${ARGN})")
  endif()
endfunction()
oglide_require(OGLIDE_C_STD 11 17)
oglide_require(OGLIDE_CXX_STD 17 20)
oglide_require(OGLIDE_WARNINGS default all extra)

set(CMAKE_C_STANDARD ${OGLIDE_C_STD})
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD ${OGLIDE_CXX_STD})
set(CMAKE_CXX_STANDARD_REQUIRED ON)

file(GLOB_RECURSE OGLIDE_APP_SOURCES CONFIGURE_DEPENDS
     "${OGLIDE_PROJECT_DIR}/src/*.c" "${OGLIDE_PROJECT_DIR}/src/*.cpp")
if(NOT OGLIDE_APP_SOURCES)
  message(FATAL_ERROR "src/ altında .c veya .cpp dosyası yok")
endif()

# Ortak hedef: app.exe, GPU seçimi kodu her zaman eklenir.
function(oglide_add_app)
  add_executable(app ${OGLIDE_APP_SOURCES} "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/oglide_gpu.c")
  target_include_directories(app PRIVATE "${OGLIDE_PROJECT_DIR}/src")
  if(OGLIDE_WARNINGS STREQUAL "all")
    target_compile_options(app PRIVATE -Wall)
  elseif(OGLIDE_WARNINGS STREQUAL "extra")
    target_compile_options(app PRIVATE -Wall -Wextra)
  endif()
endfunction()
