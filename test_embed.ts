import { geminiEmbed } from "./src/lib/geminiEmbedding";

(async () => {
  const v = await geminiEmbed("Sinh viên đăng ký ký túc xá ở đâu?");
  console.log(v.length);
})();
