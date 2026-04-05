import { NextRequest, NextResponse } from "next/server";
import * as tencentcloud from "tencentcloud-sdk-nodejs";

const Ai3DClient = tencentcloud.ai3d.v20250513.Client;

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    const secretId = req.headers.get("x-secret-id");
    const secretKey = req.headers.get("x-secret-key");

    if (!secretId || !secretKey) {
      return NextResponse.json({ error: "Missing API credentials" }, { status: 401 });
    }

    const clientConfig = {
      credential: { secretId, secretKey },
      region: "ap-guangzhou", // 修改为广州
      profile: { 
        httpProfile: { 
          endpoint: "ai3d.tencentcloudapi.com" 
        } 
      },
    };

    const client = new Ai3DClient(clientConfig);

    const params = { JobId: jobId };
    const response = await client.QueryHunyuanTo3DProJob(params);
    
    return NextResponse.json(response);

  } catch (error: unknown) {
    console.error("Query Job Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
