# Legacy profil (FreeGLUT + GLU, compatibility). Kullanıcı projesine kopyalanmaz (ADR-006);
# motor -S ile bu dizini, -DOGLIDE_PROJECT_DIR ile kullanıcı projesini verir.
cmake_minimum_required(VERSION 3.20)
project(oglide_app C CXX)

include("${CMAKE_CURRENT_LIST_DIR}/../common/oglide_common.cmake")

oglide_add_app()
target_link_libraries(app PRIVATE freeglut glu32 opengl32)
