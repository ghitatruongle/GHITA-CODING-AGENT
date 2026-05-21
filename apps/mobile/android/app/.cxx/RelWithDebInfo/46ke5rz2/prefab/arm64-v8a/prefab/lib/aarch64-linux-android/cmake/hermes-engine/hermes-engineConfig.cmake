if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "C:/Users/Acer/.gradle/caches/8.10.2/transforms/986487df75b0d3ce627ef0b188143e72/transformed/hermes-android-0.76.9-release/prefab/modules/libhermes/libs/android.arm64-v8a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/Acer/.gradle/caches/8.10.2/transforms/986487df75b0d3ce627ef0b188143e72/transformed/hermes-android-0.76.9-release/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

