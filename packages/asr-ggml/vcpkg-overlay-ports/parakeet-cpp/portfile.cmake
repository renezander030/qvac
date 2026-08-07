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
# bit-identical single-pass path.
#
# Apple Core ML (Neural Engine) encoder sidecar: adds the optional, Apple-only
# `coreml` feature (default on osx/ios). When enabled and a matching
# `<model>-encoder.mlmodelc` is present at runtime, the FastConformer encoder
# runs on the Apple Neural Engine while mel preprocessing, TDT/CTC decode and the
# tokenizer stay on ggml; a missing sidecar or a non-Apple build falls back to
# the ggml encoder. Additive and presence-driven -- non-Apple platforms are
# unaffected.
#
# qvac-parakeet namespace: the engine's installable artifacts moved out of the
# bare `parakeet` name so this port and `whisper-cpp` can share one vcpkg
# prefix. Upstream whisper.cpp v1.9.1+ builds and installs its own parakeet
# (lib/libparakeet.*, lib/cmake/parakeet/, parakeet.pc, include/parakeet.h)
# from its monolithic src/parakeet.cpp, and vcpkg refuses two owners of one
# file -- installing both ports previously failed on lib/parakeet.lib. Ours is
# now libqvac-parakeet.*, the CMake package is `qvac-parakeet` (imported target
# `qvac::parakeet`, was `parakeet-cpp` / `parakeet::parakeet`) and there is a
# new qvac-parakeet.pc. Consumers must switch to
# find_package(qvac-parakeet CONFIG) + qvac::parakeet -- see the
# transcription-parakeet update that lands alongside this bump. The C++
# `parakeet::` namespace, the include/parakeet/ header directory and this
# port's own name are unchanged; only file ownership moved.
#
# Pinned at tetherto/qvac-ext-lib-whisper.cpp master 5e57a692, shared with the
# whisper-cpp / tts-cpp / audiogen-cpp ports so all four resolve one source
# archive against one ggml-speech. engines/parakeet is byte-identical to the
# previous b965cba0 pin -- the intervening commits touch engines/tts,
# engines/audiogen and docs only -- so this is a metadata-only move, as the
# b965cba0 pin was over 1823ab31, 928369c9 and the 35cc600e namespace rename
# (PR #106), which layered on the Core ML encoder sidecar (22423551, PR #100)
# and the long-audio windowed encoder (88b690c0, PR #101).
#
# The ggml-speech floor moves to 2026-08-07, which is where the substance of
# this republish is. ggml PR #53 sizes the Vulkan matmul src0 binding from nb[]
# instead of the packed element count, so a strided src0 view stops reading past
# the end of its descriptor -- driver-dependent corruption reachable by any
# graph holding such a view -- and defaults prefer_host_memory on unified-memory
# adapters. ggml PR #52 rewrites the OpenCL im2col on its default path, which is
# what the FastConformer encoder's convolutions go through on Adreno; im2col is
# a pure gather, so the rewrite is bit-exact.

set(VCPKG_POLICY_MISMATCHED_NUMBER_OF_BINARIES enabled)
set(VCPKG_BUILD_TYPE release)

vcpkg_from_github(
    OUT_SOURCE_PATH WHISPER_CPP_SRC
    REPO tetherto/qvac-ext-lib-whisper.cpp
    REF 5e57a69221e58a091aac07b2d19895df985ba53c
    SHA512 2cce663c5c375e07d0bdc109fe40ce13727fa0f01969537fa1b2e07c8a20429e4854fc140e40d3b146f2debcb75207952c8a5efbf67d8c21dba4e60452cf53fd
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

# The engine installs its package config to lib/cmake/qvac-parakeet (was
# share/parakeet-cpp) under the new namespace; the imported target is
# qvac::parakeet.
vcpkg_cmake_config_fixup(PACKAGE_NAME qvac-parakeet CONFIG_PATH lib/cmake/qvac-parakeet)

# New in this pin: the engine also installs lib/pkgconfig/qvac-parakeet.pc,
# whose prefix= is the absolute CURRENT_PACKAGES_DIR at configure time. Rewrite
# it to the relocatable ${pcfiledir}-relative form, as the whisper-cpp and
# ggml-speech ports already do -- without this the port trips vcpkg's
# absolute-paths post-build check, and any cached binary would carry a path
# that does not exist on the consuming machine.
#
# The .pc also carries ggml's own -L/-I, which the engine derives from the
# resolved location of the imported ggml target so the file is self-sufficient
# for non-vcpkg consumers. Under vcpkg those land inside CURRENT_INSTALLED_DIR
# (ggml-speech installs into the same prefix), so they must become
# ${prefix}-relative or the packaged .pc carries this machine's paths and
# breaks every consumer that restores it from the binary cache -- the .pc
# content is part of the cached package and the ABI hash does not include the
# install root.
#
# vcpkg_fixup_pkgconfig() rewrites CURRENT_INSTALLED_DIR to ${prefix}, but only
# by exact string match, and the two sides can disagree on spelling: CMake
# emits the path as it resolved it (macOS writes /tmp/... where vcpkg passes
# /private/tmp/...), so the rewrite silently misses. Normalise by *meaning*
# rather than by spelling: rewrite any absolute -L/-I whose realpath lands
# inside the install prefix to the ${prefix}-relative form.
# Scope of the shipped .pc, verified on this port build: it is complete for
# CMake consumption (find_package(qvac-parakeet) + qvac::parakeet, which is what
# the qvac addon uses) and for pkg-config against a SHARED ggml, where
# libqvac-speech-ggml.so pulls its backend siblings transitively. It is NOT
# sufficient for pkg-config against this port's STATIC ggml with backends
# compiled in: the engine derives only ggml + ggml-base, so a static
# pkg-config link fails on the backend registration symbols
# (ggml_backend_{cpu,blas,metal}_reg, which live in the per-backend archives)
# plus their frameworks. Fixing that means deriving GGML_AVAILABLE_BACKENDS and
# their interface frameworks in the engine's .pc generation -- tracked as an
# engine follow-up, not worked around here, because duplicating that logic in
# the portfile would drift from the engine.
get_filename_component(PARAKEET_INSTALLED_REALPATH "${CURRENT_INSTALLED_DIR}" REALPATH)

function(parakeet_relativize_pc pc_file)
    if (NOT EXISTS "${pc_file}")
        return()
    endif()
    file(READ "${pc_file}" contents)
    string(REGEX MATCHALL "-[LI][^ \t\r\n\"]+" tokens "${contents}")
    foreach (token IN LISTS tokens)
        string(SUBSTRING "${token}" 0 2 flag)
        string(SUBSTRING "${token}" 2 -1 dir)
        if (NOT IS_ABSOLUTE "${dir}")
            continue()
        endif()
        get_filename_component(dir_real "${dir}" REALPATH)
        # Only touch paths inside our own prefix; a genuinely external dep
        # (e.g. a system OpenMP runtime) must keep its absolute path.
        string(FIND "${dir_real}" "${PARAKEET_INSTALLED_REALPATH}/" hit)
        if (NOT hit EQUAL 0)
            continue()
        endif()
        string(LENGTH "${PARAKEET_INSTALLED_REALPATH}/" prefix_len)
        string(SUBSTRING "${dir_real}" ${prefix_len} -1 rel)
        string(REPLACE "${token}" "${flag}\${prefix}/${rel}" contents "${contents}")
    endforeach()
    file(WRITE "${pc_file}" "${contents}")
endfunction()

file(GLOB PARAKEET_PC_FILES
    "${CURRENT_PACKAGES_DIR}/lib/pkgconfig/*.pc"
    "${CURRENT_PACKAGES_DIR}/debug/lib/pkgconfig/*.pc")
foreach (PARAKEET_PC_FILE IN LISTS PARAKEET_PC_FILES)
    parakeet_relativize_pc("${PARAKEET_PC_FILE}")
endforeach()

vcpkg_fixup_pkgconfig()

# Guard the outcome by meaning, not by spelling: after the rewrites no -L/-I in
# the shipped .pc may still resolve into this machine's install/package/build
# trees. Cheap, and it turns a silently non-relocatable package into a build
# failure here.
file(GLOB PARAKEET_PC_FILES "${CURRENT_PACKAGES_DIR}/lib/pkgconfig/*.pc")
foreach (PARAKEET_PC_FILE IN LISTS PARAKEET_PC_FILES)
    file(READ "${PARAKEET_PC_FILE}" PARAKEET_PC_CONTENTS)
    string(REGEX MATCHALL "-[LI][^ \t\r\n\"]+" PARAKEET_PC_TOKENS "${PARAKEET_PC_CONTENTS}")
    foreach (PARAKEET_PC_TOKEN IN LISTS PARAKEET_PC_TOKENS)
        string(SUBSTRING "${PARAKEET_PC_TOKEN}" 2 -1 PARAKEET_PC_DIR)
        if (NOT IS_ABSOLUTE "${PARAKEET_PC_DIR}")
            continue()
        endif()
        get_filename_component(PARAKEET_PC_DIR_REAL "${PARAKEET_PC_DIR}" REALPATH)
        foreach (PARAKEET_TREE
                 "${PARAKEET_INSTALLED_REALPATH}" "${CURRENT_PACKAGES_DIR}" "${CURRENT_BUILDTREES_DIR}")
            get_filename_component(PARAKEET_TREE_REAL "${PARAKEET_TREE}" REALPATH)
            string(FIND "${PARAKEET_PC_DIR_REAL}" "${PARAKEET_TREE_REAL}" PARAKEET_TREE_HIT)
            if (PARAKEET_TREE_HIT EQUAL 0)
                message(FATAL_ERROR
                    "parakeet-cpp: ${PARAKEET_PC_FILE} still contains '${PARAKEET_PC_TOKEN}', which "
                    "resolves inside ${PARAKEET_TREE_REAL}. The packaged .pc would not be "
                    "relocatable and would break consumers restoring this package from the "
                    "binary cache.")
            endif()
        endforeach()
    endforeach()
endforeach()

file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/include")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/share")

if (VCPKG_LIBRARY_LINKAGE MATCHES "static")
    file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/bin")
    file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/bin")
endif()

vcpkg_install_copyright(FILE_LIST "${SOURCE_PATH}/LICENSE")
