// Hybrid logical clock. Stamps sort as strings in the order the changes happened, even if a device's clock is
// behind: every stamp is greater than any stamp this device has seen (including the server's).
// Format: 13-digit ms · 4-digit counter · device ID, e.g. "1793140095123-0002-iphone-7f3a".

                        
                   
                 
                  
 

export const makeClock = (deviceId        )        => ({ deviceId, lastMs: 0, counter: 0 });

export function tick(c       , now         = Date.now())         {
  if (now > c.lastMs) {
    c.lastMs = now;
    c.counter = 0;
  } else {
    c.counter++;
  }
  return format(c.lastMs, c.counter, c.deviceId);
}

/** Advance the clock past a stamp received from elsewhere. */
export function observe(c       , stamp        )       {
  const p = parse(stamp);
  if (!p) return;
  if (p.ms > c.lastMs) {
    c.lastMs = p.ms;
    c.counter = p.counter;
  } else if (p.ms === c.lastMs && p.counter > c.counter) {
    c.counter = p.counter;
  }
}

export const format = (ms        , counter        , deviceId        )         =>
  `${String(ms).padStart(13, '0')}-${String(counter).padStart(4, '0')}-${deviceId}`;

export function parse(stamp        )                                                           {
  const m = /^(\d{13})-(\d{4})-(.+)$/.exec(stamp);
  return m ? { ms: Number(m[1]), counter: Number(m[2]), deviceId: m[3]  } : null;
}
