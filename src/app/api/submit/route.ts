import { NextRequest, NextResponse } from "next/server";
import * as tencentcloud from "tencentcloud-sdk-nodejs";

const Ai3DClient = tencentcloud.ai3d.v20250513.Client;

export async function POST(req: NextRequest) {
  try {
    const { action, prompt, imageUrl, generateType, enablePBR } = await req.json();
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

    interface SubmitParams {
      GenerateType: string;
      Model: string;
      EnablePBR: boolean;
      ResultFormat: string;
      Prompt?: string;
      ImageBase64?: string;
    }

    const params: SubmitParams = {
      GenerateType: generateType || "LowPoly",
      Model: "3.0",
      EnablePBR: enablePBR !== undefined ? enablePBR : true,
      ResultFormat: "GLB"
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

  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    console.error("Submit Job Error:", err);
    return NextResponse.json({ 
      error: err.message || "Unknown error",
      code: err.code
    }, { status: 500 });
  }
}
