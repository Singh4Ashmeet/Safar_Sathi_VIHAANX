export const en = {
  appName: 'SafarSaathi',
  common: {
    loading: 'Loading...',
    retry: 'Retry',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    delete: 'Delete',
    back: 'Back',
    offlineBanner: 'No internet. SOS will use the relay if enabled',
    offlineBannerNoRelay: 'No internet. Enable BLE relay or use SMS fallback',
    serverWakingBanner: 'Connecting to safety server, this can take up to a minute',
    simulatedBadge: 'Simulated',
    realBadge: 'Real BLE',
  },
  auth: {
    loginTitle: 'Welcome back',
    signupTitle: 'Create your safety account',
    email: 'Email address',
    password: 'Password',
    fullName: 'Full name',
    phone: 'Phone number (+91)',
    adultConsent: 'I confirm I am 18+ and consent to SafarSaathi terms and privacy notice.',
    loginCta: 'Log in',
    signupCta: 'Create account',
    loginSubtitle: 'Your personal travel safety companion', emailLabel: 'Email Address', passwordLabel: 'Password',
    quickDemo: 'Quick Demo Access →', newUser: 'New to SafarSaathi?', createAccount: 'Create account',
    signupSubtitle: 'Join SafarSaathi safety network', nameLabel: 'Full Name', phoneLabel: 'Phone Number',
    passwordHint: 'Minimum 6 characters', consent: 'I confirm that I am 18+ years of age and agree to travel emergency sharing terms.',
    setupCta: 'Create Account & Setup', existingUser: 'Already have an account?',
  },
  home: {
    sosHold: 'Hold 1.5s for SOS',
    startTrip: 'Start Safe Trip',
    watchMe: 'Watch Me',
    safetyMap: 'Safety Map',
    rideCheck: 'Ride Check',
    guardians: 'Guardians',
    privacy: 'Privacy Center',
    settings: 'Settings',
    relay: 'Offline Mesh',
    fakeCall: 'Fake Call',
    tripActiveBanner: 'Safe Trip active — protected by server watchdog',
    protectedTrip: 'PROTECTED TRIP IN PROGRESS',
    demoFootnote: 'Emergency flow preview · Demo only',
    routeSharing: 'Route & trip sharing',
    timedCheckin: 'Timed safety check-in',
    exploreAreas: 'Explore areas',
    verifyRide: 'Verify ride details',
    guardianCircle: 'Guardian Circle',
    trustedContacts: 'Your trusted contacts',
    viewAll: 'View all →',
    guardiansAdded: '2 guardians added',
    discreetAppearance: 'Subtle app appearance',
    homeNav: 'Home', tripNav: 'Trip', mapNav: 'Map', circleNav: 'Circle', profileNav: 'Profile',
  },
  trip: {
    destinationPlaceholder: 'Where are you going?',
    routePreview: 'Route Preview',
    straightLineNotice: 'Approximate straight-line ETA (routing quota fallback)',
    startProtection: 'Start Protected Trip',
    endTrip: 'End Trip Safely',
    shareLink: 'Share Live Link',
    revokeLink: 'Revoke Link',
    statusSafe: 'Safe',
    statusWarning: 'Check-in Soon',
    statusDanger: 'Alert Active',
    statusSignalLost: 'Queued',
    liveJourney: 'Live Journey', activeWatermark: 'Active Live Trip · Encrypted Tracking', protectedTrip: 'Protected Trip',
    gpsFixes: 'GPS Fixes', pending: 'pending', fixUpdated: 'Fix updated', acquiring: 'Acquiring satellite lock',
    liveSharing: 'Live sharing link:', stopSharing: 'Stop Sharing', shareLive: 'Share Live Link', endSafe: 'End Safe Trip', testPrompt: 'Test Check-in Prompt',
    planSafe: 'Plan Safe Trip', startTitle: 'Start a safe trip', startSubtitle: 'Plan your route and preview your journey status.', destinationDetails: 'DESTINATION DETAILS',
    whereGoing: 'Where are you going?', enterDestination: 'Enter destination', startingPoint: 'Starting point', currentLocation: 'My current location',
    estimatedDistance: 'Estimated distance', estimatedArrival: 'Estimated arrival', begin: 'Begin protected trip', sampleRoute: 'Sample route',
    mapDemo: 'Illustrative map · Demo only',
  },
  sos: {
    promptTitle: 'Are you safe?',
    promptSubtitle: 'Enter your PIN to confirm safety. Escalates automatically at 0s.',
    activeTitle: 'SOS Active',
    sending: 'Sending alert to safety server...',
    notDelivered: 'Not delivered yet — retrying in background',
    smsFallbackCta: 'Send SMS via Phone App Now',
    callGuardian: 'Call Guardian',
    call112: 'Call 112',
    cancelWithPin: 'Cancel Alert with PIN',
    cancelledTitle: 'Alert Cancelled',
    cancelledBody: 'Your alert has been cancelled.',
    wrongPin: 'Incorrect PIN',
    throttledPin: 'Too many wrong attempts. Please wait 30 seconds.',
    quickExit: 'Calculator',
  },
  guardians: {
    title: 'Trusted Guardians',
    subtitle: 'Add 2 to 5 guardians. Consent required before live location sharing.',
    addCta: 'Add Guardian',
    pending: 'Consent pending',
    granted: 'Consented',
    revoked: 'Revoked',
    screenTitle: 'Your guardian circle', screenSubtitle: 'Manage the people you trust.',
    cardEyebrow: 'YOUR GUARDIANS', addCtaShort: '+ Add guardian', active: 'Active',
    sharingTitle: 'How guardian sharing works',
    sharingDescription: 'In a connected app, selected guardians can receive trip links and safety alerts according to your preferences.',
    alertPreferences: 'Alert preferences', addTitle: 'Add Trusted Guardian', name: 'Guardian Name',
    namePlaceholder: 'E.g. Sister, Dad, Rohan', phone: 'Phone Number', relationship: 'Relationship',
    relationshipPlaceholder: 'Family, Friend, Partner', save: 'Save Guardian',
    preferencesTitle: 'Guardian Alert Preferences', liveLocation: 'Share live location on SOS',
    liveLocationSub: 'Send instant tracking link', battery: 'Include battery percentage',
    batterySub: 'Sends phone battery state in alerts', smsFallback: 'Emergency SMS fallback',
    smsFallbackSub: 'Sends SMS if guardian app is uninstalled', savePreferences: 'Save Preferences',
  },
  watch: {
    title: 'Watch Me Timer',
    subtitle: 'Server-owned timer alerts guardians automatically if you do not check in.',
    confirmSafe: 'I am Safe',
    header: 'Watch Me', active: 'Active Safety Session', activeDesc: "If you don't confirm you're safe before the countdown finishes, guardians will be alerted.", end: 'I Am Safe · End Session', start: 'Start a Timed Safety Session', startDesc: 'Select a duration. SafarSaathi will check in with you periodically. If you miss check-in, guardians are notified automatically.', minutes: 'Minutes',
  },
  ride: { header: 'Ride Check', title: 'Verify Vehicle & Driver', desc: 'Log your cab or auto details before boarding. Guardians will immediately receive the plate number.', service: 'Ride Service', plate: 'Vehicle License Plate', platePlaceholder: 'e.g. DL 01 AB 1234', driver: 'Driver Name (Optional)', driverPlaceholder: 'e.g. Ramesh Kumar', share: 'Share Ride With Guardians', verification: 'Boarding Verification', question: 'Does the physical plate on the vehicle match', yes: 'Yes, Matches', no: 'No · Alert!', confirmed: 'Plate verified. Trip details linked to your guardians.' },
  relay: { header: 'BLE Mesh Relay', title: 'Mesh Forwarding (Opt-in)', desc: 'Help commuters in network blackspots forward encrypted emergency distress packets.', peers: 'Nearby Peers', queued: 'Queued', forwarded: 'Forwarded', visualizer: 'Mesh Visualiser (Demo)', simulate: 'Simulate Multi-Hop BLE Broadcast' },
  onboarding: { setup: 'Safety Setup', welcome: 'Welcome to SafarSaathi', pinStep: '1. Cancel & Duress PINs', safePin: 'Safe Cancel PIN (4-6 digits)', duressPin: 'Silent Duress PIN (4-6 digits)', savePins: 'Save PINs & Continue', permissions: '2. Background Safety Permissions', grant: 'Grant Location & Notifications', battery: 'Open System Battery Settings', next: 'Next: Setup Guardians', guardians: '3. Trusted Guardians Circle', openGuardians: 'Open Guardians Circle', complete: 'Complete & Go to Home' },
  privacy: {
    title: 'Privacy Center',
    stopSharing: 'Stop All Sharing Now',
    deleteAccount: 'Delete Account & All Data',
    subtitle: 'Control who can see your safety information.',
    whoCanSee: 'Who Can See My Location', noShare: 'No active public share link right now.',
    consentedGuardians: 'Consented Guardians',
    retention: 'Zero-Knowledge & Retention Policy', deleteTripData: 'Delete All Account & Trip Data',
  },
  settings: {
    title: 'Your space',
    subtitle: 'Preferences, privacy and app settings.',
    discreetMode: 'Discreet mode',
    discreetSubtitle: 'Subtle app presentation',
    language: 'Language',
    selectLanguage: 'Select Language',
    permissions: 'Permissions',
    review: 'Review',
    privacyCentre: 'Privacy centre',
    open: 'Open',
    about: 'About SafarSaathi',
    aboutDescription: 'Your safety, quietly beside you. Prototype version 2.0.',
    signedInAs: 'Signed in as',
    logOut: 'Log Out',
    devicePermissions: 'Device Permissions',
    done: 'Done',
  },
  map: {
    title: 'Safety map', subtitle: 'Explore sample safety information around an area.', explore: 'Explore areas', sample: 'Sample data',
    day: 'Day view', night: 'Night view', all: 'All reports', watermark: 'Illustrative map · Demo only', allViews: 'All views',
    captionSuffix: 'Illustrative locations only', notes: 'Community safety notes', notesSubtitle: 'View example reports or add a sample location note.',
    report: 'Report a place', reportTitle: 'Report a Place', category: 'Category', note: 'Safety Note (Optional)',
    notePlaceholder: 'E.g. streetlights out near north exit', success: 'Report recorded successfully!', submit: 'Submit Report',
    poorLighting: 'Poor lighting', harassment: 'Harassment / unsafe gathering', isolation: 'Isolated stretch', theft: 'Snatch / theft risk', patrol: 'Patrolled / well-lit',
  },
} as const;

export interface TranslationDict {
  appName: string;
  common: {
    loading: string;
    retry: string;
    cancel: string;
    confirm: string;
    save: string;
    delete: string;
    back: string;
    offlineBanner: string;
    offlineBannerNoRelay: string;
    serverWakingBanner: string;
    simulatedBadge: string;
    realBadge: string;
  };
  auth: {
    loginTitle: string;
    signupTitle: string;
    email: string;
    password: string;
    fullName: string;
    phone: string;
    adultConsent: string;
    loginCta: string;
    signupCta: string;
  };
  home: {
    sosHold: string;
    startTrip: string;
    watchMe: string;
    safetyMap: string;
    rideCheck: string;
    guardians: string;
    privacy: string;
    settings: string;
    relay: string;
    fakeCall: string;
    tripActiveBanner: string;
  };
  trip: {
    destinationPlaceholder: string;
    routePreview: string;
    straightLineNotice: string;
    startProtection: string;
    endTrip: string;
    shareLink: string;
    revokeLink: string;
    statusSafe: string;
    statusWarning: string;
    statusDanger: string;
    statusSignalLost: string;
  };
  sos: {
    promptTitle: string;
    promptSubtitle: string;
    activeTitle: string;
    sending: string;
    notDelivered: string;
    smsFallbackCta: string;
    callGuardian: string;
    call112: string;
    cancelWithPin: string;
    cancelledTitle: string;
    cancelledBody: string;
    wrongPin: string;
    throttledPin: string;
    quickExit: string;
  };
  guardians: {
    title: string;
    subtitle: string;
    addCta: string;
    pending: string;
    granted: string;
    revoked: string;
  };
  watch: {
    title: string;
    subtitle: string;
    confirmSafe: string;
  };
  privacy: {
    title: string;
    stopSharing: string;
    deleteAccount: string;
  };
  settings: {
    title: string;
    subtitle: string;
    discreetMode: string;
    discreetSubtitle: string;
    language: string;
    selectLanguage: string;
    permissions: string;
    review: string;
    privacyCentre: string;
    open: string;
    about: string;
    aboutDescription: string;
    signedInAs: string;
    logOut: string;
    devicePermissions: string;
    done: string;
  };
}
