/**
 * Bid-Gate scorer v1 — client-side keyword/heuristic only.
 * Honest label: NOT an LLM. Transparent rubric over 6 HARD gates.
 * Runs fully in-browser; no API keys; text never leaves the page.
 */
(function () {
  'use strict';


  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function countHits(text, patterns) {
    var hits = [];
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      var re = typeof p === 'string' ? new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i') : p;
      if (re.test(text)) {
        var label = typeof p === 'string' ? p : (p.source || 'pattern');
        hits.push(label);
      }
    }
    return hits;
  }

  function overlapTokens(a, b, minLen) {
    minLen = minLen || 4;
    var stop = {
      with: 1, that: 1, this: 1, from: 1, your: 1, have: 1, will: 1,
      need: 1, looking: 1, someone: 1, about: 1, into: 1, than: 1,
      them: 1, they: 1, their: 1, would: 1, could: 1, should: 1,
      please: 1, project: 1, work: 1, job: 1, experience: 1, years: 1,
      and: 1, the: 1, for: 1, are: 1, our: 1, you: 1, can: 1
    };
    var ta = a.split(/[^a-z0-9+#.]/i).filter(function (t) {
      return t.length >= minLen && !stop[t];
    });
    var setB = {};
    b.split(/[^a-z0-9+#.]/i).forEach(function (t) {
      if (t.length >= minLen) setB[t] = 1;
    });
    var shared = [];
    var seen = {};
    for (var i = 0; i < ta.length; i++) {
      var t = ta[i];
      if (setB[t] && !seen[t]) {
        seen[t] = 1;
        shared.push(t);
      }
    }
    return shared;
  }

  // --- Gate heuristics -------------------------------------------------

  function gateLiveBuyer(job) {
    var pos = countHits(job, [
      /looking for/i, /we need/i, /i need/i, /hiring/i, /seeking/i,
      /budget/i, /fixed[- ]?price/i, /hourly/i, /\$\s?\d/i,
      /asap/i, /urgent/i, /proposals?/i, /freelancer/i, /contractor/i,
      /posted/i, /open (to|for)/i, /must be able/i
    ]);
    var neg = countHits(job, [
      /no longer (accepting|hiring)/i, /\bhired\b/i, /\bclosed\b/i,
      /\bfilled\b/i, /position filled/i, /do not (apply|bid)/i,
      /archive[d]?/i, /speculative/i
    ]);
    if (job.length < 40) {
      return { status: 'CAUTION', mark: '?', reason: 'Job text too short to confirm a live buyer ask.' };
    }
    if (neg.length) {
      return { status: 'FAIL', mark: 'NO', reason: 'Closed/filled signals: ' + neg.slice(0, 3).join(', ') };
    }
    if (pos.length >= 2) {
      return { status: 'PASS', mark: 'YES', reason: 'Live-ask signals: ' + pos.slice(0, 4).join(', ') };
    }
    if (pos.length === 1) {
      return { status: 'CAUTION', mark: '?', reason: 'Weak live-buyer signal (' + pos[0] + '). Confirm listing is open.' };
    }
    return { status: 'CAUTION', mark: '?', reason: 'No clear hiring/budget language. Confirm the ask is live.' };
  }

  function gateDeliverableClear(job) {
    var pos = countHits(job, [
      /deliverable/i, /deliver(ables)?/i, /milestone/i, /acceptance/i,
      /scope/i, /wireframe/i, /mockup/i, /landing page/i, /website/i,
      /api\b/i, /dashboard/i, /report/i, /logo/i, /figma/i, /\.pdf\b/i,
      /\.docx?\b/i, /spreadsheet/i, /prototype/i, /integration/i,
      /must include/i, /requirements?:/i, /output:/i, /format:/i,
      /pages?\b/i, /screens?\b/i, /endpoint/i, /schema/i
    ]);
    var neg = countHits(job, [
      /help (me |us )?(with|on)/i, /just need someone/i,
      /open[- ]ended/i, /as needed/i, /various tasks/i,
      /general (help|support)/i, /whatever (it )?takes/i
    ]);
    var bullets = (job.match(/(^|\n)\s*[-*•\d]+[.)]\s+\S+/g) || []).length;
    if (neg.length && pos.length < 2) {
      return { status: 'FAIL', mark: 'NO', reason: 'Vague ask language: ' + neg.slice(0, 2).join(', ') };
    }
    if (pos.length >= 2 || (pos.length >= 1 && bullets >= 2)) {
      return {
        status: 'PASS',
        mark: 'YES',
        reason: 'Concrete scope cues' + (pos.length ? ': ' + pos.slice(0, 4).join(', ') : '') +
          (bullets ? ' (+' + bullets + ' list items)' : '')
      };
    }
    if (pos.length === 1 || bullets >= 2) {
      return { status: 'CAUTION', mark: '?', reason: 'Partial scope cues only. Write the deliverable in one sentence before bidding.' };
    }
    return { status: 'FAIL', mark: 'NO', reason: 'No concrete deliverable, format, or acceptance cues found.' };
  }

  function gateCanDeliver(job, profile) {
    if (!profile || profile.length < 20) {
      return {
        status: 'CAUTION',
        mark: '?',
        reason: 'No profile/proposal text pasted — cannot auto-check truthful fit. Self-check skills & tools.'
      };
    }
    var shared = overlapTokens(job, profile, 4);
    var skillish = countHits(job, [
      /react/i, /node\.?js/i, /python/i, /typescript/i, /wordpress/i,
      /shopify/i, /figma/i, /photoshop/i, /seo\b/i, /copywriting/i,
      /swift/i, /kotlin/i, /aws\b/i, /docker/i, /kubernetes/i,
      /excel/i, /tableau/i, /salesforce/i, /hubspot/i, /laravel/i,
      /django/i, /flutter/i, /next\.?js/i, /vue\b/i, /angular/i
    ]);
    var fakeFlags = countHits(profile, [
      /guaranteed (results|ranking|income)/i, /100%\s*win/i,
      /fake (review|portfolio)/i
    ]);
    if (fakeFlags.length) {
      return { status: 'FAIL', mark: 'NO', reason: 'Profile/proposal contains honesty-risk language.' };
    }
    var covered = 0;
    for (var i = 0; i < skillish.length; i++) {
      var re = skillish[i];
      try {
        if (new RegExp(re, 'i').test(profile) || profile.indexOf(String(re).replace(/\\b/g, '')) >= 0) {
          covered++;
        }
      } catch (e) { /* ignore */ }
    }
    // Simpler: how many skillish job terms also appear in profile
    covered = 0;
    var coveredLabels = [];
    var skillPatterns = [
      'react', 'nodejs', 'node.js', 'python', 'typescript', 'wordpress',
      'shopify', 'figma', 'photoshop', 'seo', 'copywriting', 'swift',
      'kotlin', 'aws', 'docker', 'excel', 'tableau', 'salesforce',
      'hubspot', 'laravel', 'django', 'flutter', 'nextjs', 'next.js',
      'vue', 'angular', 'javascript', 'php', 'java', 'golang', 'go',
      'rust', 'sql', 'postgres', 'mongodb', 'graphql', 'tailwind'
    ];
    for (var j = 0; j < skillPatterns.length; j++) {
      var sk = skillPatterns[j];
      var re2 = new RegExp('\\b' + sk.replace(/\./g, '\\.') + '\\b', 'i');
      if (re2.test(job) && re2.test(profile)) {
        covered++;
        coveredLabels.push(sk);
      }
    }
    if (covered >= 2 || shared.length >= 5) {
      return {
        status: 'PASS',
        mark: 'YES',
        reason: 'Overlap with pasted profile: ' +
          (coveredLabels.slice(0, 5).join(', ') || shared.slice(0, 6).join(', '))
      };
    }
    if (covered === 1 || shared.length >= 2) {
      return {
        status: 'CAUTION',
        mark: '?',
        reason: 'Thin skill/keyword overlap. Confirm you can deliver without stretching claims.'
      };
    }
    return {
      status: 'FAIL',
      mark: 'NO',
      reason: 'Little/no overlap between job skills and pasted profile — high risk of untruthful bid.'
    };
  }

  function gateMargin(job) {
    var unpaid = countHits(job, [
      /unpaid/i, /for exposure/i, /equity only/i, /no (budget|pay)/i,
      /volunteer/i, /test (task|project) (unpaid|free)/i, /free trial (work|project)/i,
      /pay (only )?after (results|hire)/i
    ]);
    if (unpaid.length) {
      return { status: 'FAIL', mark: 'NO', reason: 'Unpaid / no-cash path signals: ' + unpaid.slice(0, 2).join(', ') };
    }
    var money = job.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k\b|\/\s*hr|per\s*hour|\/hr)?/gi) || [];
    var hourly = /\$\s?\d[\d,]*.{0,8}(\/\s*hr|per\s*hour|hourly)/i.test(job);
    var lowHourly = /\$\s?([1-9]|1[0-4])(?:\.\d+)?\s*(\/\s*hr|per\s*hour)/i.test(job);
    var budgetWord = /\bbudget\b/i.test(job);
    if (lowHourly) {
      return { status: 'FAIL', mark: 'NO', reason: 'Very low hourly signal (<~$15/hr). Likely negative unit margin after fees.' };
    }
    if (money.length >= 1 || (budgetWord && hourly)) {
      return {
        status: 'CAUTION',
        mark: '?',
        reason: 'Budget cues found (' + (money.slice(0, 2).join('; ') || 'budget/hourly') +
          '). You must still compute net after fees − delivery cost.'
      };
    }
    if (budgetWord) {
      return { status: 'CAUTION', mark: '?', reason: 'Mentions budget but no clear $ amount. Run the margin math before bidding.' };
    }
    return {
      status: 'CAUTION',
      mark: '?',
      reason: 'No price/budget numbers detected. Do not assume positive margin — fill the math yourself.'
    };
  }

  function gateRisk(job) {
    var bad = countHits(job, [
      /medical advice/i, /legal advice/i, /financial advice/i,
      /guaranteed returns?/i, /pump/i, /insider/i,
      /\bscrape\b/i, /scraping/i, /\bhack(ing|ed)?\b/i, /bypass (paywall|login|auth)/i,
      /credit card (numbers?|dump)/i, /\bssn\b/i, /social security/i,
      /password(s)? (list|dump|crack)/i, /malware/i, /ransomware/i,
      /underage/i, /onlyfans.?hack/i, /revenge porn/i,
      /physical (delivery|fulfillment) (nationwide|worldwide)/i,
      /controlled substance/i, /\bweapon(s)?\b/i
    ]);
    var softRisk = countHits(job, [
      /\bpii\b/i, /personally identifiable/i, /hipaa/i, /gdpr/i,
      /nda required/i, /background check/i, /licensed (attorney|doctor|cpa)/i
    ]);
    if (bad.length) {
      return { status: 'FAIL', mark: 'NO', reason: 'Risk/fatal cues: ' + bad.slice(0, 3).join(', ') };
    }
    if (softRisk.length) {
      return {
        status: 'CAUTION',
        mark: '?',
        reason: 'Elevated compliance cues (' + softRisk.slice(0, 3).join(', ') + '). Confirm you can handle legally.'
      };
    }
    return { status: 'PASS', mark: 'YES', reason: 'No obvious legal/safety/PII fatal keywords in the pasted text.' };
  }

  function gateAccess(job, profile) {
    var offPlatform = countHits(job, [
      /pay (via |by )?(wire|western union|crypto|bitcoin|usdt)/i,
      /outside (of )?upwork/i, /off[- ]platform/i, /avoid (the )?fees/i,
      /telegram only/i, /whatsapp only/i
    ]);
    if (offPlatform.length) {
      return {
        status: 'FAIL',
        mark: 'NO',
        reason: 'Off-platform / risky payment path cues: ' + offPlatform.slice(0, 2).join(', ')
      };
    }
    var ready = false;
    if (profile) {
      ready = /account ready|can submit|connects (available|ready)|payment method (set|verified)|withdrawals? (enabled|ready)/i.test(profile);
    }
    if (ready) {
      return { status: 'PASS', mark: 'YES', reason: 'Profile notes suggest submit/payout access is ready.' };
    }
    return {
      status: 'CAUTION',
      mark: 'OWNER_GATE?',
      reason: 'Access cannot be proven from job text. Confirm account can submit & get paid (or queue Owner gate).'
    };
  }

  function scoreAll(jobRaw, profileRaw) {
    var job = norm(jobRaw);
    var profile = norm(profileRaw);
    var gates = [
      { id: 1, name: 'LIVE_BUYER', result: gateLiveBuyer(job) },
      { id: 2, name: 'DELIVERABLE_CLEAR', result: gateDeliverableClear(job) },
      { id: 3, name: 'CAN_TRUTHFULLY_DELIVER', result: gateCanDeliver(job, profile) },
      { id: 4, name: 'POSITIVE_UNIT_MARGIN', result: gateMargin(job) },
      { id: 5, name: 'RISK_ACCEPTABLE', result: gateRisk(job) },
      { id: 6, name: 'TRANSACTION_ACCESS', result: gateAccess(job, profile) }
    ];

    var fails = 0;
    var cautions = 0;
    var passes = 0;
    for (var i = 0; i < gates.length; i++) {
      var s = gates[i].result.status;
      if (s === 'FAIL') fails++;
      else if (s === 'CAUTION') cautions++;
      else passes++;
    }

    var verdict;
    var summary;
    if (fails >= 1) {
      verdict = 'SKIP';
      summary = 'At least one HARD gate failed. Do not submit — fix or walk away.';
    } else if (cautions >= 3 || (cautions >= 2 && passes <= 3)) {
      verdict = 'CAUTION';
      summary = 'No hard FAIL, but several gates are uncertain. Clarify evidence before spending Connects.';
    } else if (cautions >= 1) {
      verdict = 'CAUTION';
      summary = 'Mostly clear, with soft uncertainty. Resolve marked gates, then decide.';
    } else {
      verdict = 'GO';
      summary = 'All six HARD gates passed the heuristic check. Still write a one-line delivery plan before you bid.';
    }

    return { gates: gates, verdict: verdict, summary: summary, counts: { pass: passes, caution: cautions, fail: fails } };
  }

  // --- DOM -------------------------------------------------------------

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function render(result, out) {
    out.innerHTML = '';
    out.hidden = false;

    var banner = el('div', 'score-banner score-' + result.verdict.toLowerCase());
    banner.appendChild(el('p', 'score-label', 'Heuristic verdict'));
    banner.appendChild(el('p', 'score-verdict', result.verdict));
    banner.appendChild(el('p', 'score-summary', result.summary));
    banner.appendChild(
      el(
        'p',
        'score-counts',
        'PASS ' + result.counts.pass + ' · CAUTION ' + result.counts.caution + ' · FAIL ' + result.counts.fail
      )
    );
    out.appendChild(banner);

    var list = el('ul', 'score-gates');
    for (var i = 0; i < result.gates.length; i++) {
      var g = result.gates[i];
      var li = el('li', 'score-gate status-' + g.result.status.toLowerCase());
      var head = el('div', 'score-gate-head');
      var mark = el('span', 'score-mark', g.result.mark);
      head.appendChild(mark);
      head.appendChild(el('strong', null, g.id + '. ' + g.name));
      head.appendChild(el('span', 'score-status', g.result.status));
      li.appendChild(head);
      li.appendChild(el('p', 'score-reason', g.result.reason));
      list.appendChild(li);
    }
    out.appendChild(list);

    var honesty = el(
      'p',
      'score-honesty',
      'Method: client-side keyword & heuristic rubric (v1) — not an LLM, not a guarantee. Text stays in your browser. Any HARD NO → treat as SKIP.'
    );
    out.appendChild(honesty);

    var next = el('div', 'score-next card');
    if (result.verdict === 'GO') {
      next.appendChild(el('p', null, 'Next: write a one-line delivery plan, then bid.'));
    } else if (result.verdict === 'CAUTION') {
      next.appendChild(el('p', null, 'Next: resolve each “?” gate with evidence. If still unsure, skip — Connects are finite.'));
    } else {
      next.appendChild(el('p', null, 'Next: do not submit. Re-scope, find another job, or fix the failed gate first.'));
    }
    out.appendChild(next);
  }

  function bind() {
    var form = document.getElementById('bid-gate-form');
    var out = document.getElementById('score-output');
    var job = document.getElementById('job-text');
    var profile = document.getElementById('profile-text');
    var clearBtn = document.getElementById('score-clear');
    if (!form || !out || !job) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var j = job.value;
      if (!j || j.trim().length < 20) {
        out.hidden = false;
        out.innerHTML = '';
        var err = el('div', 'score-banner score-skip');
        err.appendChild(el('p', 'score-verdict', 'SKIP'));
        err.appendChild(el('p', 'score-summary', 'Paste at least a short job description (~20+ characters) to score.'));
        out.appendChild(err);
        out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      var result = scoreAll(j, profile ? profile.value : '');
      render(result, out);
      out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        form.reset();
        out.hidden = true;
        out.innerHTML = '';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
