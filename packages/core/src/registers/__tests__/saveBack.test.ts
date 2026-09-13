import { describe, expect, it } from 'vitest';

import { renderSaveBack } from '../saveBack.js';
import type { SaveBackConfig } from '../types.js';

const aad: SaveBackConfig = {
  title: 'His enlistment record',
  fields: [
    { key: 'serial_number', label: 'Army serial number', required: true },
    { key: 'enlistment_date', label: 'Date of enlistment', isYear: true },
    { key: 'enlistment_place', label: 'Place of enlistment' },
    { key: 'residence', label: 'Residence (county, state)' },
    { key: 'civilian_occupation', label: 'Civilian occupation' },
    { key: 'marital_status', label: 'Marital status' },
    { key: 'record_url', label: 'Record link' },
  ],
  recordNameTemplate: 'Army serial number {serial_number}',
  summaryTemplate: 'Enlisted {enlistment_date} at {enlistment_place} · of {residence} · {civilian_occupation} · {marital_status}',
  sourceCitation: 'NARA, WWII Army Enlistment Records (AAD)',
  urlKey: 'record_url',
};

describe('renderSaveBack', () => {
  it('renders name, summary, payload, and the event year from the dated field', () => {
    const out = renderSaveBack(aad, {
      serial_number: '11128325',
      enlistment_date: ' 1944-03-02 ',
      enlistment_place: 'Ft McPherson, Atlanta, Georgia',
      residence: 'Pinellas, Florida',
      civilian_occupation: '',
      marital_status: 'Single, without dependents',
      record_url: 'https://aad.archives.gov/aad/record-detail.jsp?dt=893&rid=8383951',
    });
    expect(out.recordName).toBe('Army serial number 11128325');
    expect(out.recordSummary).toBe(
      'Enlisted 1944-03-02 at Ft McPherson, Atlanta, Georgia · of Pinellas, Florida · Single, without dependents',
    );
    expect(out.savedPayload).toMatchObject({ serial_number: '11128325', event_year: 1944 });
    expect(out.savedPayload).not.toHaveProperty('civilian_occupation');
    expect(out.findingAidUrl).toBe('https://aad.archives.gov/aad/record-detail.jsp?dt=893&rid=8383951');
    expect(out.missing).toEqual([]);
  });

  it('names missing required fields and refuses a non-URL as the source link', () => {
    const out = renderSaveBack(aad, { record_url: 'rid 8383951' });
    expect(out.missing).toEqual(['Army serial number']);
    expect(out.findingAidUrl).toBeNull();
    // A segment whose only placeholder is empty goes, static words and all.
    expect(out.recordName).toBe('');
    expect(out.recordSummary).toBe('');
  });

  it('drops a whole segment only when every placeholder in it is empty', () => {
    const out = renderSaveBack(aad, { serial_number: '1', enlistment_date: '', enlistment_place: 'Boston' });
    expect(out.recordSummary).toBe('Enlisted at Boston');
    expect(out.savedPayload).not.toHaveProperty('event_year');
  });
});
