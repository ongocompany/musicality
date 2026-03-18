Pod::Spec.new do |s|
  s.name           = 'my-module'
  s.version        = '1.0.0'
  s.summary        = 'Audio extractor native module for Ritmo'
  s.description    = 'Extracts audio from video/audio files and downsamples to mono 22kHz WAV'
  s.homepage       = 'https://github.com/ongocompany/musicality'
  s.license        = 'MIT'
  s.author         = 'Ongo Company'
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.source_files   = 'ios/**/*.{swift,h,m}'
  s.module_name    = 'my_module'
  s.dependency 'ExpoModulesCore'
end
