// Stub — we never call jsPDF's .html() method, so html2canvas is unused.
export default function html2canvas() {
  return Promise.resolve(null)
}
