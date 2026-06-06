cmake_minimum_required(VERSION 3.13)

# Define the library name here.
project(appmodules)

# This file includes all the necessary to let you build your application with the New Architecture.
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# Suppress $ identifier warnings from React Native codegen in third-party libraries.
# The codegen generates code using $ prefixed variables which triggers -Wdollar-in-identifier-extension
# when -Wall is enabled. We must add this AFTER subdirectories are processed, because each library's
# own CMakeLists.txt sets -Wall in target_compile_options which overrides earlier flags.
get_property(_subdirs DIRECTORY ${CMAKE_CURRENT_BINARY_DIR} PROPERTY SUBDIRECTORIES)
foreach(_subdir ${_subdirs})
  get_property(_targets DIRECTORY ${_subdir} PROPERTY BUILDSYSTEM_TARGETS)
  foreach(_tgt ${_targets})
    get_target_property(_type ${_tgt} TYPE)
    if(NOT _type STREQUAL "INTERFACE_LIBRARY")
      target_compile_options(${_tgt} PRIVATE -Wno-dollar-in-identifier-extension)
    endif()
  endforeach()
  # Also check nested subdirectories (codegen may add its own subdirs)
  get_property(_nested_dirs DIRECTORY ${_subdir} PROPERTY SUBDIRECTORIES)
  foreach(_nested ${_nested_dirs})
    get_property(_nested_targets DIRECTORY ${_nested} PROPERTY BUILDSYSTEM_TARGETS)
    foreach(_ntgt ${_nested_targets})
      get_target_property(_ntype ${_ntgt} TYPE)
      if(NOT _ntype STREQUAL "INTERFACE_LIBRARY")
        target_compile_options(${_ntgt} PRIVATE -Wno-dollar-in-identifier-extension)
      endif()
    endforeach()
  endforeach()
endforeach()
