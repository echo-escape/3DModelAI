import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const modelUrl = searchParams.get("url");

  if (!modelUrl) return NextResponse.json({ error: "Missing URL" }, { status: 400 });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(modelUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return NextResponse.json({ error: "Upstream access denied" }, { status: response.status });

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const first4 = Array.from(bytes.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`Proxy: Fetched ${modelUrl}, size: ${buffer.byteLength}, first 4 bytes: ${first4}`);

    // ZIP 文件检测 (PK...)
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      console.log("Proxy: Archive detected, extracting...");
      const zip = await JSZip.loadAsync(buffer);
      
      // 1. 优先 GLB
      const glbEntry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith(".glb") && !f.dir);
      if (glbEntry) {
        console.log(`Proxy: Found GLB in zip: ${glbEntry.name}`);
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
        console.log(`Proxy: Found OBJ in zip: ${objEntry.name}`);
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
      throw new Error("No usable model found in zip archive");
    }

    // 非 ZIP 直接透传
    let format = "glb";
    let contentType = "application/octet-stream";
    
    // 通过魔数探测
    if (bytes[0] === 0x67 && bytes[1] === 0x6C && bytes[2] === 0x54 && bytes[3] === 0x46) {
      format = "glb";
      contentType = "model/gltf-binary";
    } else if (bytes[0] === 0x53 && bytes[1] === 0x54 && bytes[2] === 0x4C) { // STL
      format = "stl";
      contentType = "model/stl";
    } else if (new TextDecoder().decode(bytes.slice(0, 80)).toLowerCase().includes("solid")) {
      format = "stl";
      contentType = "model/stl";
    } else if (new TextDecoder().decode(bytes.slice(0, 80)).includes("v ")) {
      format = "obj";
      contentType = "text/plain";
    } else {
      // 通过扩展名兜底
      const lowerUrl = modelUrl.toLowerCase();
      if (lowerUrl.includes(".obj")) format = "obj";
      else if (lowerUrl.includes(".stl")) format = "stl";
      else format = "glb"; // 默认作为 glb
    }

    console.log(`Proxy: Identified format: ${format}, content-type: ${contentType}`);

    return new NextResponse(buffer, {
      headers: { 
        "Content-Type": contentType,
        "X-Model-Format": format,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "X-Model-Format"
      }
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error("Proxy Extractor Error:", error);
    return NextResponse.json({ error: error.message || "Unknown error" }, { status: 500 });
  }
}
