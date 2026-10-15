/**
 * Remove common high-risk identifiers if a candidate volunteers them. This is
 * intentionally narrow: the interviewer prompt prevents asking for sensitive
 * data, while this guard keeps obvious identifiers out of transcripts/reports
 * without erasing legitimate years, metrics, or technical details.
 */
export function redactSensitiveText(input: string): string {
  return input
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, "[PAN redacted]")
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "[government ID redacted]")
    .replace(/(?:\+?91[ -]?)?[6-9]\d{4}[ -]?\d{5}\b/g, "[phone number redacted]")
    .replace(
      /\b(password|passcode|one[- ]time password|otp|security pin)\s*(?:is|was|:|=)?\s*[A-Z0-9@#$%^&*!_-]{4,}\b/gi,
      "$1 [redacted]",
    );
}
