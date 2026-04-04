import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const modelUrl = searchParams.get("url");

  if (!modelUrl) return NextResponse.json({ error: "Missing URL" }, { status: 400 });

  try {
    const response = await fetch(modelUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" }
    });
    
    if (!response.ok) return NextResponse.json({ error: "Upstream access denied" }, { status: response.status });

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // ZIP 文件检测
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      console.log("Archive detected, extracting...");
      const zip = await JSZip.loadAsync(buffer);
      
      // 1. 优先 GLB
      const glbEntry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith(".glb") && !f.dir);
      if (glbEntry) {
        const data = await glbEntry.async("arraybuffer");
        return new NextResponse(data, {
          headers: { 
            "Content-Type": "model/gltf-binary",
            "X-Model-Format": "glb",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "X-Model-Format"
          }
        });
      }

      // 2. 其次 OBJ
      const objEntry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith(".obj") && !f.dir);
      if (objEntry) {
        const data = await objEntry.async("arraybuffer");
        return new NextResponse(data, {
          headers: { 
            "Content-Type": "text/plain",
            "X-Model-Format": "obj",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "X-Model-Format"
          }
        });
      }
      throw new Error("No usable model found in zip");
    }

    // 非 ZIP 直接透传
    return new NextResponse(buffer, {
      headers: { 
        "Content-Type": "application/octet-stream",
        "X-Model-Format": "glb",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "X-Model-Format"
      }
    });

  } catch (err: any) {
    console.error("Proxy Extractor Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
