Pod::Spec.new do |s|
  s.name           = 'KipAudio'
  s.version        = '0.1.0'
  s.summary        = 'Kip bedroom audio metering and spike clips'
  s.description    = 'Local Expo Module: 1 Hz relative dB metering, spike clips, on-device speech check.'
  s.author         = 'Kip'
  s.homepage       = 'https://github.com/ehewes/durhack-proj'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '16.0' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
end
