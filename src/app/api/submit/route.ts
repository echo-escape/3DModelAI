import { NextRequest, NextResponse } from "next/server";
import * as tencentcloud from "tencentcloud-sdk-nodejs";

const Ai3DClient = tencentcloud.ai3d.v20250513.Client;

export async function POST(req: NextRequest) {
  try {
    const { action, prompt, imageUrl } = await req.json();
    const secretId = req.headers.get("x-secret-id");
    const secretKey = req.headers.get("x-secret-key");

    if (!secretId || !secretKey) {
      return NextResponse.json({ error: "Missing API credentials" }, { status: 401 });
    }

    const clientConfig = {
      credential: { 
        secretId, 
        secretKey,
      },
      region: "ap-guangzhou", // 修改为广州
      profile: { 
        httpProfile: { 
          endpoint: "ai3d.tencentcloudapi.com" 
        } 
      },
    };

    const client = new Ai3DClient(clientConfig);

    let params: any = {
      // 默认使用 LowPoly 以获得更好的拓扑结构，适合 3D 打印
      GenerateType: "LowPoly",
      Model: "3.0"
    };

    if (action === "text-to-3d") {
      params.Prompt = prompt;
    } else if (action === "image-to-3d") {
      // 腾讯云要求 ImageBase64 不带 data:image/... 前缀
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
      params.ImageBase64 = base64Data;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const response = await client.SubmitHunyuanTo3DProJob(params);
    return NextResponse.json(response);

  } catch (error: any) {
    console.error("Submit Job Error:", error);
    return NextResponse.json({ 
      error: error.message || "Unknown error",
      code: error.code
    }, { status: 500 });
  }
}
