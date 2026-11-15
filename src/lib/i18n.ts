export type Locale = 'ar' | 'en';
export const LOCALES: Locale[] = ['ar', 'en'];
export const LOCALE_COOKIE = 'pms_locale';

const en = {
  appName: 'Parking Management',
  appTagline: 'Spaces · Tenants · Contracts',
  nav: { dashboard: 'Dashboard', floors: 'Floor maps', tenants: 'Tenants', contracts: 'Contracts', imports: 'Import', reports: 'Reports', notifications: 'Notifications', settings: 'Settings' },
  common: {
    search: 'Search…', save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', add: 'Add', create: 'Create', close: 'Close', back: 'Back', loading: 'Loading…',
    confirm: 'Confirm', yes: 'Yes', no: 'No', all: 'All', none: 'None', actions: 'Actions', view: 'View', download: 'Download', print: 'Print / PDF', refresh: 'Refresh',
    noData: 'Nothing here yet', error: 'Something went wrong', saved: 'Saved', days: 'days', day: 'day', spots: 'spots', spot: 'spot', total: 'Total', notes: 'Notes',
    language: 'العربية', theme: 'Theme', light: 'Light', dark: 'Dark', system: 'System', logout: 'Sign out', profile: 'Profile', optional: 'optional', required: 'Required',
    from: 'From', to: 'To', status: 'Status', type: 'Type', name: 'Name', email: 'Email', phone: 'Phone', date: 'Date', amount: 'Amount', currency: 'SAR', perYear: '/ year',
    page: 'Page', of: 'of', next: 'Next', previous: 'Previous', open: 'Open', select: 'Select', clear: 'Clear', yesDelete: 'Yes, delete', reason: 'Reason',
  },
  status: { AVAILABLE: 'Available', RENTED: 'Rented', EXPIRING: 'Expiring soon', EXPIRED: 'Expired', INACTIVE: 'Out of service' },
  contractStatus: { DRAFT: 'Draft', ACTIVE: 'Active', RENEWED: 'Renewed', EXPIRED: 'Expired', TERMINATED: 'Terminated' },
  spotType: { STANDARD: 'Standard', VIP: 'VIP', SHADED: 'Shaded', OUTSIDE: 'Open yard' },
  kind: { INCLUDED: 'Included with office', PAID: 'Paid extra' },
  role: { ADMIN: 'Administrator', OWNER: 'Owner', STAFF: 'Staff' },
  login: { title: 'Welcome back', subtitle: 'Sign in to manage the building parking', email: 'Email', password: 'Password', submit: 'Sign in', invalid: 'Invalid email or password' },
  dashboard: {
    title: 'Dashboard', subtitle: 'Live overview of parking occupancy, contracts and revenue', occupancy: 'Overall occupancy', vacant: 'Vacant spots', activeContracts: 'Active contracts',
    expiring: 'Expiring soon', revenue: 'Annual revenue', monthly: 'monthly', needsReview: 'Need review', byFloor: 'Occupancy by floor', timeline: 'Contract expiries — next 12 months',
    expiringList: 'Contracts expiring soon', noExpiring: 'No contracts expiring within the threshold', alerts: 'Attention', belowMin: 'tenants below the 2-spot minimum',
    reviewHint: 'imported contracts need price/date review', overbooked: 'over capacity', capacity: 'Capacity', occupied: 'Occupied', atRisk: 'Revenue at risk (90 days)', within: 'within',
    tenants: 'Tenants', unnumbered: 'Unnumbered', contractsCount: 'Contracts',
  },
  floors: {
    title: 'Floor maps', subtitle: 'Click any spot to see its status, tenant and contract', legend: 'Legend', zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Fit', searchSpot: 'Spot no. or tenant…',
    unplaced: 'Spots not on the drawing', unplacedHint: 'These spots exist in the records but have no position on the plan yet. Use “Edit layout” to place them.',
    selectMode: 'Select for contract', selected: 'selected', createContract: 'Create contract', editLayout: 'Edit layout', doneEditing: 'Done', saveLayout: 'Save layout',
    unnumberedBanner: 'Open-yard parking is rented by quantity (no fixed numbers)', allocated: 'allocated', ofCapacity: 'of capacity', noMap: 'No drawing for this area — showing a seat grid.',
    spot: 'Spot', tenant: 'Tenant', contract: 'Contract', start: 'Start', end: 'End', daysLeft: 'Days left', kind: 'Rent type', history: 'History', viewContract: 'Open contract',
    renew: 'Renew', newContract: 'New contract for this spot', outOfService: 'Out of service', setInService: 'Back in service', setOutOfService: 'Mark out of service', noTenant: 'Not rented',
    editorHint: 'Select a spot, then click on the plan to move it. Use the buttons to rotate or remove its position.', rotate: 'Rotate 90°', removeFromMap: 'Remove from map', placeHere: 'Click on the plan to place spot',
    unsaved: 'unsaved changes', reviewBadge: 'Needs review', floorsOverview: 'All floors',
  },
  tenants: {
    title: 'Tenants', subtitle: 'Offices renting parking in the building', new: 'New tenant', nameAr: 'Name (Arabic)', nameEn: 'Name (English)', code: 'Short code', units: 'Office units',
    cr: 'Commercial reg.', minSpots: 'Minimum spots', spots: 'Spots', nextExpiry: 'Next expiry', contacts: 'Contacts', addContact: 'Add contact', position: 'Position', whatsapp: 'WhatsApp',
    primary: 'Primary', reminders: 'Receives reminders', belowMin: 'Below minimum', contracts: 'Contracts', officeUnits: 'Office units', inactive: 'Inactive', active: 'Active', details: 'Details',
  },
  contracts: {
    title: 'Contracts', subtitle: 'Annual parking contracts', new: 'New contract', number: 'Contract no.', tenant: 'Tenant', period: 'Period', start: 'Start date', end: 'End date',
    annual: 'Annual amount', spots: 'Spots', expiringFilter: 'Expiring ≤', renew: 'Renew', terminate: 'Terminate', terminateTitle: 'Terminate contract', terminateHint: 'The spots become available immediately from the termination date.',
    renewTitle: 'Renew contract', renewHint: 'Creates a new annual contract starting the day after the current one ends, with the same spots.', increase: 'Price change %',
    pickSpots: 'Spots', pickFloor: 'Floor', addSpots: 'Add spots', allocations: 'Unnumbered (open yard)', quantity: 'Quantity', price: 'Price / year', autoPrice: 'auto (tariff)',
    allowBelow: 'Approve below-minimum exception', minimumNote: 'Each office must rent at least 2 spots.', summary: 'Summary', totalSpots: 'Total spots', estimated: 'Estimated annual amount',
    renewedFrom: 'Renewal of', renewedBy: 'Renewed by', deliveries: 'Reminder log', needsReview: 'Needs review', markReviewed: 'Mark as reviewed', terminatedOn: 'Terminated on',
    created: 'Contract created', noSpots: 'No spots selected', chooseTenant: 'Choose tenant…', remaining: 'remaining', overdue: 'overdue', draft: 'Save as draft',
  },
  imports: {
    title: 'Import from Excel', subtitle: 'Upload the PARKING STATEMENT workbook — preview everything before saving', drop: 'Drop the .xlsx file here or click to choose', preview: 'Preview',
    commit: 'Import now', discard: 'Discard', startDate: 'Contract start date', replace: 'Terminate existing active contracts first', issues: 'Issues report', tenantsFound: 'Tenants',
    numbered: 'Numbered spots', unnumbered: 'Unnumbered', conflicts: 'Conflicts', warnings: 'Warnings', errors: 'Errors', info: 'Info', units: 'Office units', history: 'Import history',
    success: 'Import completed', row: 'Row', message: 'Message', severity: 'Severity', file: 'File', byFloor: 'Spots by location', existing: 'active contracts already exist',
  },
  reports: {
    title: 'Reports', subtitle: 'Export to Excel or print to PDF', spots: 'Spots & status', contracts: 'All contracts', expiring: 'Expiring within 60 days', tenants: 'Tenants', occupancy: 'Occupancy by floor',
    excelAr: 'Excel (Arabic)', excelEn: 'Excel (English)', printable: 'Printable report', generated: 'Generated',
  },
  notifications: { title: 'Notifications', subtitle: 'Contract reminders and system alerts', markAll: 'Mark all as read', empty: 'You are all caught up', runNow: 'Run reminders now', deliveries: 'Delivery log', channel: 'Channel', recipient: 'Recipient', ran: 'Reminder job finished' },
  settings: {
    title: 'Settings', subtitle: 'Pricing, reminders, users and preferences', general: 'General', building: 'Building name', pricing: 'Default annual tariff per spot', threshold: '“Expiring soon” threshold (days)',
    minSpots: 'Minimum spots per office', ownerEmails: 'Extra owner emails (comma separated)', prefix: 'Contract number prefix', rules: 'Reminder rules', daysBefore: 'Days before end', channels: 'Channels',
    notifyOwner: 'Owner', notifyTenant: 'Tenant', addRule: 'Add rule', users: 'Users', addUser: 'Add user', password: 'Password', newPassword: 'New password', currentPassword: 'Current password',
    myProfile: 'My profile', role: 'Role', active: 'Active', lastLogin: 'Last login', changePassword: 'Change password', apiDocs: 'API documentation',
  },
};

export type Dict = typeof en;

const ar: Dict = {
  appName: 'إدارة الباركينج',
  appTagline: 'الأماكن · المستأجرون · العقود',
  nav: { dashboard: 'لوحة التحكم', floors: 'خرائط الطوابق', tenants: 'المستأجرون', contracts: 'العقود', imports: 'الاستيراد', reports: 'التقارير', notifications: 'الإشعارات', settings: 'الإعدادات' },
  common: {
    search: 'بحث…', save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', edit: 'تعديل', add: 'إضافة', create: 'إنشاء', close: 'إغلاق', back: 'رجوع', loading: 'جارٍ التحميل…',
    confirm: 'تأكيد', yes: 'نعم', no: 'لا', all: 'الكل', none: 'لا يوجد', actions: 'إجراءات', view: 'عرض', download: 'تنزيل', print: 'طباعة / PDF', refresh: 'تحديث',
    noData: 'لا توجد بيانات بعد', error: 'حدث خطأ ما', saved: 'تم الحفظ', days: 'يوم', day: 'يوم', spots: 'أماكن', spot: 'مكان', total: 'الإجمالي', notes: 'ملاحظات',
    language: 'English', theme: 'المظهر', light: 'فاتح', dark: 'داكن', system: 'تلقائي', logout: 'تسجيل الخروج', profile: 'الملف الشخصي', optional: 'اختياري', required: 'مطلوب',
    from: 'من', to: 'إلى', status: 'الحالة', type: 'النوع', name: 'الاسم', email: 'البريد الإلكتروني', phone: 'الجوال', date: 'التاريخ', amount: 'المبلغ', currency: 'ر.س', perYear: '/ سنوياً',
    page: 'صفحة', of: 'من', next: 'التالي', previous: 'السابق', open: 'فتح', select: 'اختيار', clear: 'مسح', yesDelete: 'نعم، احذف', reason: 'السبب',
  },
  status: { AVAILABLE: 'متاح', RENTED: 'مؤجّر', EXPIRING: 'قارب على الانتهاء', EXPIRED: 'منتهي', INACTIVE: 'خارج الخدمة' },
  contractStatus: { DRAFT: 'مسودة', ACTIVE: 'ساري', RENEWED: 'مُجدَّد', EXPIRED: 'منتهي', TERMINATED: 'مُنهى' },
  spotType: { STANDARD: 'عادي', VIP: 'VIP', SHADED: 'مظلل', OUTSIDE: 'ساحة مفتوحة' },
  kind: { INCLUDED: 'ضمن عقد المكتب', PAID: 'إضافي مدفوع' },
  role: { ADMIN: 'مدير النظام', OWNER: 'المالك', STAFF: 'موظف' },
  login: { title: 'مرحباً بعودتك', subtitle: 'سجّل الدخول لإدارة باركينج المبنى', email: 'البريد الإلكتروني', password: 'كلمة المرور', submit: 'تسجيل الدخول', invalid: 'البريد أو كلمة المرور غير صحيحة' },
  dashboard: {
    title: 'لوحة التحكم', subtitle: 'نظرة حيّة على الإشغال والعقود والإيرادات', occupancy: 'نسبة الإشغال الكلية', vacant: 'أماكن شاغرة', activeContracts: 'العقود السارية',
    expiring: 'قاربت على الانتهاء', revenue: 'الإيراد السنوي', monthly: 'شهرياً', needsReview: 'تحتاج مراجعة', byFloor: 'الإشغال حسب الطابق', timeline: 'انتهاء العقود — الـ 12 شهراً القادمة',
    expiringList: 'عقود قاربت على الانتهاء', noExpiring: 'لا توجد عقود تنتهي خلال المدة المحددة', alerts: 'تنبيهات', belowMin: 'مستأجر أقل من الحد الأدنى (مكانين)',
    reviewHint: 'عقود مستوردة تحتاج مراجعة السعر والتواريخ', overbooked: 'فوق السعة', capacity: 'السعة', occupied: 'مشغول', atRisk: 'إيراد معرّض (90 يوم)', within: 'خلال',
    tenants: 'المستأجرون', unnumbered: 'بدون رقم', contractsCount: 'العقود',
  },
  floors: {
    title: 'خرائط الطوابق', subtitle: 'اضغط على أي مكان لعرض حالته والمستأجر والعقد', legend: 'دليل الألوان', zoomIn: 'تكبير', zoomOut: 'تصغير', reset: 'ملاءمة', searchSpot: 'رقم المكان أو المستأجر…',
    unplaced: 'أماكن غير موجودة على المخطط', unplacedHint: 'هذه الأماكن موجودة في السجلات لكن ليس لها موضع على المخطط بعد. استخدم «تعديل المخطط» لوضعها.',
    selectMode: 'اختيار لعقد', selected: 'محدد', createContract: 'إنشاء عقد', editLayout: 'تعديل المخطط', doneEditing: 'تم', saveLayout: 'حفظ المخطط',
    unnumberedBanner: 'مواقف الساحة المفتوحة تؤجَّر بالعدد (بدون أرقام ثابتة)', allocated: 'مخصص', ofCapacity: 'من السعة', noMap: 'لا يوجد مخطط لهذه المنطقة — يتم العرض كشبكة مقاعد.',
    spot: 'المكان', tenant: 'المستأجر', contract: 'العقد', start: 'البداية', end: 'الانتهاء', daysLeft: 'الأيام المتبقية', kind: 'نوع الإيجار', history: 'السجل التاريخي', viewContract: 'فتح العقد',
    renew: 'تجديد', newContract: 'عقد جديد لهذا المكان', outOfService: 'خارج الخدمة', setInService: 'إعادة للخدمة', setOutOfService: 'إيقاف المكان', noTenant: 'غير مؤجّر',
    editorHint: 'اختر مكاناً ثم اضغط على المخطط لنقله. استخدم الأزرار للتدوير أو إزالة موضعه.', rotate: 'تدوير 90°', removeFromMap: 'إزالة من المخطط', placeHere: 'اضغط على المخطط لوضع المكان',
    unsaved: 'تعديلات غير محفوظة', reviewBadge: 'يحتاج مراجعة', floorsOverview: 'كل الطوابق',
  },
  tenants: {
    title: 'المستأجرون', subtitle: 'المكاتب المستأجرة لمواقف في المبنى', new: 'مستأجر جديد', nameAr: 'الاسم (عربي)', nameEn: 'الاسم (إنجليزي)', code: 'الرمز المختصر', units: 'الوحدات المكتبية',
    cr: 'السجل التجاري', minSpots: 'الحد الأدنى للأماكن', spots: 'الأماكن', nextExpiry: 'أقرب انتهاء', contacts: 'جهات الاتصال', addContact: 'إضافة جهة اتصال', position: 'المسمى الوظيفي', whatsapp: 'واتساب',
    primary: 'أساسي', reminders: 'يستلم التذكيرات', belowMin: 'أقل من الحد الأدنى', contracts: 'العقود', officeUnits: 'الوحدات المكتبية', inactive: 'غير نشط', active: 'نشط', details: 'البيانات',
  },
  contracts: {
    title: 'العقود', subtitle: 'عقود الباركينج السنوية', new: 'عقد جديد', number: 'رقم العقد', tenant: 'المستأجر', period: 'المدة', start: 'تاريخ البداية', end: 'تاريخ الانتهاء',
    annual: 'القيمة السنوية', spots: 'الأماكن', expiringFilter: 'ينتهي خلال ≤', renew: 'تجديد', terminate: 'إنهاء', terminateTitle: 'إنهاء العقد', terminateHint: 'تصبح الأماكن متاحة فوراً من تاريخ الإنهاء.',
    renewTitle: 'تجديد العقد', renewHint: 'ينشئ عقداً سنوياً جديداً يبدأ في اليوم التالي لانتهاء الحالي بنفس الأماكن.', increase: 'نسبة تغيير السعر %',
    pickSpots: 'الأماكن', pickFloor: 'الطابق', addSpots: 'إضافة أماكن', allocations: 'بدون أرقام (الساحة المفتوحة)', quantity: 'العدد', price: 'السعر / سنة', autoPrice: 'تلقائي (حسب التعرفة)',
    allowBelow: 'اعتماد استثناء أقل من الحد الأدنى', minimumNote: 'لكل مكتب مكانين كحد أدنى.', summary: 'الملخص', totalSpots: 'إجمالي الأماكن', estimated: 'القيمة السنوية التقديرية',
    renewedFrom: 'تجديد لعقد', renewedBy: 'جُدِّد بعقد', deliveries: 'سجل التذكيرات', needsReview: 'يحتاج مراجعة', markReviewed: 'تمت المراجعة', terminatedOn: 'أُنهي بتاريخ',
    created: 'تم إنشاء العقد', noSpots: 'لم يتم اختيار أماكن', chooseTenant: 'اختر المستأجر…', remaining: 'متبقي', overdue: 'متأخر', draft: 'حفظ كمسودة',
  },
  imports: {
    title: 'الاستيراد من Excel', subtitle: 'ارفع ملف PARKING STATEMENT — راجع كل شيء قبل الحفظ', drop: 'اسحب ملف ‎.xlsx هنا أو اضغط للاختيار', preview: 'معاينة',
    commit: 'استيراد الآن', discard: 'تجاهل', startDate: 'تاريخ بداية العقود', replace: 'إنهاء العقود السارية الحالية أولاً', issues: 'تقرير الملاحظات والأخطاء', tenantsFound: 'المستأجرون',
    numbered: 'أماكن مرقمة', unnumbered: 'بدون أرقام', conflicts: 'تعارضات', warnings: 'تحذيرات', errors: 'أخطاء', info: 'معلومات', units: 'الوحدات المكتبية', history: 'سجل الاستيراد',
    success: 'تم الاستيراد بنجاح', row: 'الصف', message: 'الرسالة', severity: 'المستوى', file: 'الملف', byFloor: 'الأماكن حسب الموقع', existing: 'عقد ساري موجود بالفعل',
  },
  reports: {
    title: 'التقارير', subtitle: 'تصدير Excel أو طباعة PDF', spots: 'الأماكن وحالاتها', contracts: 'كل العقود', expiring: 'تنتهي خلال 60 يوم', tenants: 'المستأجرون', occupancy: 'الإشغال حسب الطابق',
    excelAr: 'Excel (عربي)', excelEn: 'Excel (إنجليزي)', printable: 'تقرير للطباعة', generated: 'تاريخ الإنشاء',
  },
  notifications: { title: 'الإشعارات', subtitle: 'تذكيرات العقود وتنبيهات النظام', markAll: 'تعليم الكل كمقروء', empty: 'لا توجد إشعارات جديدة', runNow: 'تشغيل التذكيرات الآن', deliveries: 'سجل الإرسال', channel: 'القناة', recipient: 'المستلم', ran: 'تم تشغيل التذكيرات' },
  settings: {
    title: 'الإعدادات', subtitle: 'الأسعار والتذكيرات والمستخدمون والتفضيلات', general: 'عام', building: 'اسم المبنى', pricing: 'التعرفة السنوية الافتراضية للمكان', threshold: 'مدة «قارب على الانتهاء» (أيام)',
    minSpots: 'الحد الأدنى للأماكن لكل مكتب', ownerEmails: 'إيميلات إضافية للمالك (مفصولة بفواصل)', prefix: 'بادئة رقم العقد', rules: 'قواعد التذكير', daysBefore: 'قبل الانتهاء بـ (يوم)', channels: 'القنوات',
    notifyOwner: 'المالك', notifyTenant: 'المستأجر', addRule: 'إضافة قاعدة', users: 'المستخدمون', addUser: 'إضافة مستخدم', password: 'كلمة المرور', newPassword: 'كلمة المرور الجديدة', currentPassword: 'كلمة المرور الحالية',
    myProfile: 'ملفي الشخصي', role: 'الصلاحية', active: 'نشط', lastLogin: 'آخر دخول', changePassword: 'تغيير كلمة المرور', apiDocs: 'توثيق الـ API',
  },
};

export const dictionaries: Record<Locale, Dict> = { ar, en };
export const dirOf = (l: Locale) => (l === 'ar' ? 'rtl' : 'ltr');
