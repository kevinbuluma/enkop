import { describe, expect, it } from 'vitest';
import { enquiryProblem, enquirySchema, propertyInterest } from '@/lib/enquiry-schema';

const base = { name: 'Ann Wanjiru', email: 'ann@example.com', phone: '', message: 'I would like to arrange a viewing.', property_id: null, preferred_date: null, preferred_contact: 'Email' as const, interest: 'Buying', website: '' };

describe('enquiry validation', () => {
  it('accepts enquiries about listings with the longest allowed title', () => {
    const interest = propertyInterest('A'.repeat(120));
    expect(enquirySchema.safeParse({ ...base, interest }).success).toBe(true);
  });
  it('accepts the form topics and rejects anything else', () => {
    expect(enquirySchema.safeParse({ ...base, interest: 'General enquiry' }).success).toBe(true);
    expect(enquirySchema.safeParse({ ...base, interest: 'Free money' }).success).toBe(false);
  });
  it('only accepts calendar dates for a viewing', () => {
    expect(enquirySchema.safeParse({ ...base, preferred_date: '2026-11-02' }).success).toBe(true);
    for (const preferred_date of ['abc', 'infinity', '2026-11-02; drop']) expect(enquirySchema.safeParse({ ...base, preferred_date }).success).toBe(false);
  });
  it('explains problems in plain language', () => {
    const result = enquirySchema.safeParse({ ...base, email: 'a@b' });
    expect(result.success).toBe(false);
    if (!result.success) expect(enquiryProblem(result.error)).toBe('Please enter a valid email address.');
    const blank = enquirySchema.safeParse({ ...base, name: '   ' });
    if (!blank.success) expect(enquiryProblem(blank.error)).toBe('Please enter your full name.');
  });
});
