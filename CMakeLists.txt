cmake_minimum_required(VERSION 3.15)
project(s0beit_sp CXX)

# gta_sa.exe is a 32-bit process; the plugin must be built for Win32 / i686.
if(CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "Build for 32-bit: cmake -A Win32 (MSVC) or use cmake/mingw-i686.cmake")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(s0beit_sp SHARED
    src/main.cpp
    src/cheats.cpp
    src/config.cpp
    src/menu.cpp
    src/render.cpp
)

# ASI loaders pick up any DLL renamed to .asi
set_target_properties(s0beit_sp PROPERTIES PREFIX "" SUFFIX ".asi")
target_compile_definitions(s0beit_sp PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX _CRT_SECURE_NO_WARNINGS)

if(MSVC)
    target_compile_options(s0beit_sp PRIVATE /W3 /MP)
    set_property(TARGET s0beit_sp PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
else()
    target_compile_options(s0beit_sp PRIVATE -Wall -Wextra -Wno-unused-parameter -O2)
    target_link_options(s0beit_sp PRIVATE -static -static-libgcc -static-libstdc++)
endif()

target_link_libraries(s0beit_sp PRIVATE user32 gdi32)

add_custom_command(TARGET s0beit_sp POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
            ${CMAKE_SOURCE_DIR}/s0beit_sp.ini $<TARGET_FILE_DIR:s0beit_sp>/s0beit_sp.ini)
