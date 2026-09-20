export default {
  fetch: async () => {
    const res = await fetch("https://apod.nasa.gov/apod/image/1103/lroc_wac_nearside800.jpg");
    const blob = await res.blob();
    return new Response(blob, {
      headers: { "Content-Type": "image/jpeg" }
    });
  }
}
