// Describes every editable text field so the admin "Site Content" page can
// render a generic form (grouped, labelled) instead of a hand-built page
// per field. Add a row here and it shows up in the admin panel automatically.
'use strict';

module.exports = [
  { group: 'Home — Hero', key: 'hero_eyebrow', label: 'Small label above headline', type: 'text' },
  { group: 'Home — Hero', key: 'hero_title', label: 'Headline — line 1', type: 'text' },
  { group: 'Home — Hero', key: 'hero_title_accent', label: 'Headline — line 2 (shown in red)', type: 'text' },
  { group: 'Home — Hero', key: 'hero_lead', label: 'Intro paragraph', type: 'textarea' },

  { group: 'About Page', key: 'about_title', label: 'Heading', type: 'text' },
  { group: 'About Page', key: 'about_body1', label: 'Paragraph 1', type: 'textarea' },
  { group: 'About Page', key: 'about_body2', label: 'Paragraph 2', type: 'textarea' },
  { group: 'About Page', key: 'stat1_num', label: 'Stat 1 — number', type: 'text' },
  { group: 'About Page', key: 'stat1_label', label: 'Stat 1 — label', type: 'text' },
  { group: 'About Page', key: 'stat2_num', label: 'Stat 2 — number', type: 'text' },
  { group: 'About Page', key: 'stat2_label', label: 'Stat 2 — label', type: 'text' },
  { group: 'About Page', key: 'stat3_num', label: 'Stat 3 — number', type: 'text' },
  { group: 'About Page', key: 'stat3_label', label: 'Stat 3 — label', type: 'text' },

  { group: 'Quality & Process Page', key: 'quality_intro', label: 'Intro paragraph', type: 'textarea' },
  { group: 'Quality & Process Page', key: 'process1_title', label: 'Step 1 — title', type: 'text' },
  { group: 'Quality & Process Page', key: 'process1_body', label: 'Step 1 — description', type: 'textarea' },
  { group: 'Quality & Process Page', key: 'process2_title', label: 'Step 2 — title', type: 'text' },
  { group: 'Quality & Process Page', key: 'process2_body', label: 'Step 2 — description', type: 'textarea' },
  { group: 'Quality & Process Page', key: 'process3_title', label: 'Step 3 — title', type: 'text' },
  { group: 'Quality & Process Page', key: 'process3_body', label: 'Step 3 — description', type: 'textarea' },
  { group: 'Quality & Process Page', key: 'process4_title', label: 'Step 4 — title', type: 'text' },
  { group: 'Quality & Process Page', key: 'process4_body', label: 'Step 4 — description', type: 'textarea' },

  { group: 'Contact & Footer', key: 'contact_intro', label: 'Contact page intro', type: 'textarea' },
  { group: 'Contact & Footer', key: 'address', label: 'Mill address', type: 'textarea' },
  { group: 'Contact & Footer', key: 'phone', label: 'Phone number', type: 'text' },
  { group: 'Contact & Footer', key: 'email', label: 'Email address', type: 'text' },
  { group: 'Contact & Footer', key: 'fssai', label: 'FSSAI licence number', type: 'text' },
];
