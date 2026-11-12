export default {
  async email(message, env) {
    const raw = await new Response(message.raw).text();
    const response = await fetch(env.INGEST_URL, {
      method: "POST",
      headers: {
        "content-type": "message/rfc822",
        authorization: `Bearer ${env.INGEST_TOKEN}`,
      },
      body: raw,
    });
    if (!response.ok) {
      message.setReject(`The collector refused this letter (${response.status}).`);
    }
  },
};
