cmake_minimum_required(VERSION 3.22)
project(Luma VERSION 0.2.0 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>") # Windows users need no Visual C++ redistributable
add_compile_options($<$<CXX_COMPILER_ID:MSVC>:/utf-8>)
include(FetchContent)
if(JUCE_SOURCE_DIR)
  add_subdirectory("${JUCE_SOURCE_DIR}" juce)
else()
  FetchContent_Declare(JUCE GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 7c9d3783b127263d72bb65fe0a7e2dc8a02a7ac2 GIT_SHALLOW FALSE)
  FetchContent_MakeAvailable(JUCE)
endif()
juce_add_plugin(Luma COMPANY_NAME "Luma Audio" BUNDLE_ID "audio.luma.synth"
  PLUGIN_MANUFACTURER_CODE Luma PLUGIN_CODE Lum1 FORMATS VST3 AU Standalone
  PRODUCT_NAME "Luma" IS_SYNTH TRUE NEEDS_MIDI_INPUT TRUE NEEDS_MIDI_OUTPUT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  COPY_PLUGIN_AFTER_BUILD FALSE)
target_sources(Luma PRIVATE plugins/luma/src/Plugin.cpp plugins/luma/src/Editor.cpp)
target_compile_definitions(Luma PUBLIC JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0)
target_link_libraries(Luma PRIVATE juce::juce_audio_utils juce::juce_dsp PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
juce_add_console_app(LumaSmoke PRODUCT_NAME "Luma Smoke")
target_sources(LumaSmoke PRIVATE plugins/luma/tests/Smoke.cpp plugins/luma/src/Plugin.cpp plugins/luma/src/Editor.cpp)
target_compile_definitions(LumaSmoke PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
target_link_libraries(LumaSmoke PRIVATE juce::juce_audio_utils juce::juce_dsp)
enable_testing()
add_test(NAME synth_smoke COMMAND LumaSmoke)

juce_add_plugin(LumaRms COMPANY_NAME "Luma Audio" BUNDLE_ID "audio.luma.rms"
  PLUGIN_MANUFACTURER_CODE Luma PLUGIN_CODE Lrm1 FORMATS VST3 AU
  PRODUCT_NAME "Luma RMS" IS_SYNTH FALSE NEEDS_MIDI_INPUT FALSE NEEDS_MIDI_OUTPUT FALSE
  COPY_PLUGIN_AFTER_BUILD FALSE VST3_CATEGORIES Fx Analyzer AU_MAIN_TYPE kAudioUnitType_Effect)
target_sources(LumaRms PRIVATE plugins/rms/src/Processor.cpp plugins/rms/src/Editor.cpp)
target_compile_definitions(LumaRms PUBLIC JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0)
target_link_libraries(LumaRms PRIVATE juce::juce_audio_processors PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
juce_add_console_app(LumaRmsTests PRODUCT_NAME "Luma RMS Tests")
target_sources(LumaRmsTests PRIVATE plugins/rms/tests/Rms.cpp plugins/rms/src/Processor.cpp plugins/rms/src/Editor.cpp)
target_compile_definitions(LumaRmsTests PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
target_link_libraries(LumaRmsTests PRIVATE juce::juce_audio_processors)
add_test(NAME rms_measurement COMMAND LumaRmsTests)

juce_add_plugin(LumaOrbit COMPANY_NAME "Luma Audio" BUNDLE_ID "audio.luma.orbit"
  VERSION 0.5.0
  PLUGIN_MANUFACTURER_CODE Luma PLUGIN_CODE Orb1 FORMATS VST3 AU Standalone
  PRODUCT_NAME "Luma Orbit" IS_SYNTH TRUE NEEDS_MIDI_INPUT FALSE NEEDS_MIDI_OUTPUT FALSE
  COPY_PLUGIN_AFTER_BUILD FALSE)
target_sources(LumaOrbit PRIVATE plugins/orbit/src/Processor.cpp plugins/orbit/src/Editor.cpp)
target_compile_definitions(LumaOrbit PUBLIC JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0)
target_link_libraries(LumaOrbit PRIVATE juce::juce_audio_utils PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
juce_add_console_app(LumaOrbitTests PRODUCT_NAME "Luma Orbit Tests")
target_sources(LumaOrbitTests PRIVATE plugins/orbit/tests/Orbit.cpp plugins/orbit/src/Processor.cpp plugins/orbit/src/Editor.cpp)
target_compile_definitions(LumaOrbitTests PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
target_link_libraries(LumaOrbitTests PRIVATE juce::juce_audio_utils)
add_test(NAME orbit_sequencer COMMAND LumaOrbitTests)

juce_add_binary_data(LumaAcidoData SOURCES plugins/acido-core/demos.json)
set_target_properties(LumaAcidoData PROPERTIES POSITION_INDEPENDENT_CODE ON)
function(luma_acido_plugin target name code bundle studio)
  juce_add_plugin(${target} COMPANY_NAME "Luma Audio" BUNDLE_ID "${bundle}" VERSION 0.1.0
    PLUGIN_MANUFACTURER_CODE Luma PLUGIN_CODE ${code} FORMATS VST3 AU Standalone
    PRODUCT_NAME "${name}" IS_SYNTH TRUE NEEDS_MIDI_INPUT TRUE NEEDS_MIDI_OUTPUT FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE)
  target_sources(${target} PRIVATE plugins/acido-core/Processor.cpp plugins/acido-core/Editor.cpp)
  target_compile_definitions(${target} PUBLIC LUMA_STUDIO=${studio} JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0)
  target_link_libraries(${target} PRIVATE LumaAcidoData juce::juce_audio_utils PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
  juce_add_console_app(${target}Tests PRODUCT_NAME "${name} Tests")
  target_sources(${target}Tests PRIVATE plugins/acido-core/tests/CoreTests.cpp plugins/acido-core/Processor.cpp plugins/acido-core/Editor.cpp)
  target_compile_definitions(${target}Tests PRIVATE LUMA_STUDIO=${studio} JucePlugin_Name="${name}" JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
  target_link_libraries(${target}Tests PRIVATE LumaAcidoData juce::juce_audio_utils)
  add_test(NAME ${target}_core COMMAND ${target}Tests)
endfunction()
luma_acido_plugin(LumaAcido "Luma Acido" Acd1 audio.luma.acido 0)
luma_acido_plugin(LumaStudio "Luma Studio" Std1 audio.luma.studio 1)
