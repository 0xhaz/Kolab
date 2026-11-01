Pod::Spec.new do |s|
  s.name           = 'KolabVideo'
  s.version        = '1.0.0'
  s.summary        = 'On-device video composition for Kolab creators (AVFoundation).'
  s.description    = 'Trim, join, caption, brand overlays, music mix and MP4 export.'
  s.author         = 'Kolab'
  s.homepage       = 'https://kolab.local'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
