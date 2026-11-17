# Modern profil (GLFW + GLAD 2, OpenGL 3.3 core). Kullanıcı projesine kopyalanmaz (ADR-006);
# motor -S ile bu dizini, -DOGLIDE_PROJECT_DIR ile kullanıcı projesini verir.
cmake_minimum_required(VERSION 3.20)
project(oglide_app C CXX)

include("${CMAKE_CURRENT_LIST_DIR}/../common/oglide_common.cmake")

set(OGLIDE_GLAD_DIR "${CMAKE_CURRENT_LIST_DIR}/third_party/glad")
add_library(glad STATIC "${OGLIDE_GLAD_DIR}/src/gl.c")
target_include_directories(glad PUBLIC "${OGLIDE_GLAD_DIR}/include")

oglide_add_app()
target_link_libraries(app PRIVATE glad glfw3 opengl32)
