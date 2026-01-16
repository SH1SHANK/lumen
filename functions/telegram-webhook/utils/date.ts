// Date utilities for IST timezone

const TIMEZONE = "Asia/Kolkata";

function formatClassDate(date: Date): string {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function getTodayIST(): string {
  const now = new Date();
  const istTime = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }));
  return formatClassDate(istTime);
}

export function getTomorrowIST(): string {
  const now = new Date();
  const istTime = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }));
  istTime.setDate(istTime.getDate() + 1);
  return formatClassDate(istTime);
}

export { TIMEZONE };
