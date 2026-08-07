# audiogen-cpp: ACE-Step music generation in pure C++/ggml, from the
# engines/audiogen/ subfolder of qvac-ext-lib-whisper.cpp. Consumes ggml-speech
# for the custom snake / col2im_1d ops the Oobleck VAE needs.
#
# This pin (qvac-ext-lib-whisper.cpp PRs #126 and #129) runs ACE-Step end to end
# on Adreno OpenCL. Bring-up came first: music-cli and acestep-cli now set
# backends_dir, so a GGML_BACKEND_DL build no longer starts with an empty
# registry; Adreno 700+ prefers OpenCL over Vulkan, the same tier policy
# engines/tts already ships, with every other platform keeping ggml's choice;
# the FSQ detokenizer's fsq_proj and special_tokens and the cond encoder's
# timbre embed_tokens are materialised as F32 at load, which removes a BF16
# mul_mat, a per-step quantised cast and an unconditional abort on every q4
# generate; and the VAE progress callback ticks every 16 nodes instead of every
# node, which had cut the dispatch batch and drained the pipeline once per node
# (isolated VAE decode, T_latent=32: CPU 19.7 -> 4.46 s, OpenCL 44.6 -> 37.0 s).
#
# Two defects then surfaced on real input rather than synthetic input. The lyric
# encoder's residual stream reaches 4.17e5 at hidden channel 259, a massive-
# activation channel ~6x past fp16 max, so a backend staging activations as half
# saturated it to inf and the next rms_norm turned the row into zeros plus one
# NaN; 2 bad values out of 368640 made the DiT latent 100% NaN and the render
# came out as digital silence with exit code 0 and nothing logged. The encoder
# now asks for GGML_PREC_F32, which the LM already did and ggml-opencl already
# honours. Separately the overlapping-window VAE decode had its window hardcoded
# at 256 core frames, so a 30 s decode asked for a 1155 MiB buffer on a device
# reporting a 1024 MB cap and aborted; the window is now sized from the active
# backend's allocation limit, which is a no-op wherever that limit is unset.
#
# The ggml-speech floor moves to 2026-08-07 as a hard dependency: the Oobleck
# VAE needs the OpenCL snake and col2im_1d kernels that ggml PR #52 adds, along
# with the 170x im2col rewrite that makes the decode practical there.

set(VCPKG_POLICY_MISMATCHED_NUMBER_OF_BINARIES enabled)
set(VCPKG_BUILD_TYPE release)

vcpkg_from_github(
    OUT_SOURCE_PATH WHISPER_CPP_SRC
    REPO tetherto/qvac-ext-lib-whisper.cpp
    REF 5e57a69221e58a091aac07b2d19895df985ba53c
    SHA512 2cce663c5c375e07d0bdc109fe40ce13727fa0f01969537fa1b2e07c8a20429e4854fc140e40d3b146f2debcb75207952c8a5efbf67d8c21dba4e60452cf53fd
    HEAD_REF master
)

set(SOURCE_PATH "${WHISPER_CPP_SRC}/engines/audiogen")
if (NOT EXISTS "${SOURCE_PATH}/CMakeLists.txt")
    message(FATAL_ERROR
        "audiogen-cpp: ${SOURCE_PATH}/CMakeLists.txt missing; the engines/audiogen/ "
        "subfolder layout in qvac-ext-lib-whisper.cpp may have changed.")
endif()

vcpkg_check_features(OUT_FEATURE_OPTIONS FEATURE_OPTIONS
    FEATURES
        metal   GGML_METAL
        vulkan  GGML_VULKAN
        cuda    GGML_CUDA
        opencl  GGML_OPENCL
)

set(PLATFORM_OPTIONS)

if(NOT VCPKG_TARGET_IS_OSX)
    list(APPEND PLATFORM_OPTIONS
        -DGGML_BLAS=OFF
        -DGGML_ACCELERATE=OFF
        -DCMAKE_DISABLE_FIND_PACKAGE_BLAS=ON
    )
endif()

vcpkg_cmake_configure(
    SOURCE_PATH "${SOURCE_PATH}"
    DISABLE_PARALLEL_CONFIGURE
    OPTIONS
        -DAUDIOGEN_BUILD_LIBRARY=ON
        -DAUDIOGEN_BUILD_EXECUTABLES=OFF
        -DAUDIOGEN_BUILD_TESTS=OFF
        -DAUDIOGEN_INSTALL=ON
        -DAUDIOGEN_USE_SYSTEM_GGML=ON
        -DBUILD_SHARED_LIBS=OFF
        -DGGML_NATIVE=OFF
        -DGGML_OPENMP=OFF
        -DGGML_CCACHE=OFF
        -DAUDIOGEN_CCACHE=OFF
        ${FEATURE_OPTIONS}
        ${PLATFORM_OPTIONS}
)

vcpkg_cmake_install()

vcpkg_cmake_config_fixup(PACKAGE_NAME audiogen-cpp CONFIG_PATH share/audiogen-cpp)

file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/include")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/share")

if (VCPKG_LIBRARY_LINKAGE MATCHES "static")
    file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/bin")
    file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/bin")
endif()

vcpkg_install_copyright(FILE_LIST "${SOURCE_PATH}/LICENSE")
