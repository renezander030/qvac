# parakeet-cpp: NVIDIA Parakeet ASR + Sortformer diarization in pure C++/ggml.
# Sourced from the engines/parakeet/ subfolder of tetherto/qvac-ext-lib-whisper.cpp;
# consumes the ggml-speech port.
#
# Long-audio memory fix: bound offline-transcription memory. transcribe_samples
# / transcribe_samples_stream previously ran the conformer encoder over the whole
# input in a single graph (O(T_enc^2) self-attention), OOMing on multi-hour files
# (~100 GB for a 90 min file, SIGKILL). This pin computes the mel once (global
# CMVN) and slides the encoder over it in overlapping windows, trimming the
# shared context at the interior seams; inputs that fit one window keep the
# bit-identical single-pass path. Requires ggml-speech >= 2026-07-15 (unchanged
# from the previous pin).
#
# Apple Core ML (Neural Engine) encoder sidecar: adds the optional, Apple-only
# `coreml` feature (default on osx/ios). When enabled and a matching
# `<model>-encoder.mlmodelc` is present at runtime, the FastConformer encoder
# runs on the Apple Neural Engine while mel preprocessing, TDT/CTC decode and the
# tokenizer stay on ggml; a missing sidecar or a non-Apple build falls back to
# the ggml encoder. Additive and presence-driven -- non-Apple platforms are
# unaffected.
#
# Pinned at tetherto/qvac-ext-lib-whisper.cpp master 22423551 (PR #100), the
# merged Core ML encoder-sidecar change layered on the long-audio windowed
# encoder (88b690c0, PR #101) on the engines/parakeet layout.

set(VCPKG_POLICY_MISMATCHED_NUMBER_OF_BINARIES enabled)
set(VCPKG_BUILD_TYPE release)

vcpkg_from_github(
    OUT_SOURCE_PATH WHISPER_CPP_SRC
    REPO tetherto/qvac-ext-lib-whisper.cpp
    REF 5e5f2da3f9025215539ff32b65158215c9c11af8
    SHA512 f1dacd05e2bfe88763492f882bbd65217dec8aeb948f6e371840834c07e9e1af39dab58c55879a18ca9076667363f4219b98a7d361b4e795425f2fedad75d0b2
    HEAD_REF master
)

set(SOURCE_PATH "${WHISPER_CPP_SRC}/engines/parakeet")
if (NOT EXISTS "${SOURCE_PATH}/CMakeLists.txt")
    message(FATAL_ERROR
        "parakeet-cpp: ${SOURCE_PATH}/CMakeLists.txt missing; the engines/parakeet/ "
        "subfolder layout in qvac-ext-lib-whisper.cpp may have changed.")
endif()

set(GGML_METAL  OFF)
set(GGML_VULKAN OFF)
set(GGML_CUDA   OFF)
set(GGML_OPENCL OFF)
if("metal" IN_LIST FEATURES)
    set(GGML_METAL ON)
endif()
if("vulkan" IN_LIST FEATURES)
    set(GGML_VULKAN ON)
endif()
if("cuda" IN_LIST FEATURES)
    set(GGML_CUDA ON)
endif()
if("opencl" IN_LIST FEATURES)
    set(GGML_OPENCL ON)
endif()

set(PARAKEET_COREML OFF)
if("coreml" IN_LIST FEATURES)
    set(PARAKEET_COREML ON)
endif()

vcpkg_cmake_configure(
    SOURCE_PATH "${SOURCE_PATH}"
    DISABLE_PARALLEL_CONFIGURE
    OPTIONS
        -DPARAKEET_BUILD_LIBRARY=ON
        -DPARAKEET_BUILD_EXECUTABLES=OFF
        -DPARAKEET_BUILD_TESTS=OFF
        -DPARAKEET_BUILD_EXAMPLES=OFF
        -DPARAKEET_INSTALL=ON
        -DPARAKEET_USE_SYSTEM_GGML=ON
        -DBUILD_SHARED_LIBS=OFF
        -DGGML_NATIVE=OFF
        -DGGML_OPENMP=OFF
        -DPARAKEET_OPENMP=OFF
        -DGGML_CCACHE=OFF
        -DPARAKEET_CCACHE=OFF
        -DGGML_METAL=${GGML_METAL}
        -DGGML_VULKAN=${GGML_VULKAN}
        -DGGML_CUDA=${GGML_CUDA}
        -DGGML_OPENCL=${GGML_OPENCL}
        -DPARAKEET_COREML=${PARAKEET_COREML}
)

vcpkg_cmake_install()

# engines/parakeet's installable artifacts moved to the qvac-parakeet
# namespace (whisper.cpp PR #106) so this port can coexist with
# whisper-cpp: upstream whisper.cpp v1.9.1+ installs its own parakeet
# (lib/libparakeet.*, lib/cmake/parakeet/, parakeet.pc) and vcpkg
# refuses two owners of one file. Consumers now do
# find_package(qvac-parakeet) and link qvac::parakeet.
vcpkg_cmake_config_fixup(PACKAGE_NAME qvac-parakeet CONFIG_PATH lib/cmake/qvac-parakeet)

# The engine now also installs lib/pkgconfig/qvac-parakeet.pc, whose
# prefix= would otherwise bake in the absolute packages dir.
vcpkg_fixup_pkgconfig()

file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/include")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/share")

if (VCPKG_LIBRARY_LINKAGE MATCHES "static")
    file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/bin")
    file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/bin")
endif()

vcpkg_install_copyright(FILE_LIST "${SOURCE_PATH}/LICENSE")
