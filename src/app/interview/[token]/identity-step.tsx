"use client";

/** Step 3 — identity snapshot: center face, capture, upload to the gateway. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { GATEWAY_URL } from "./use-interview-stream";
import { GhostButton, Panel, PrimaryButton } from "./ui";

type UploadState = "idle" | "uploading" | "done" | "fail";

export function IdentityStep({
  token,
  candidateName,
  cameraStream,
  onStart,
}: {
  token: string;
  candidateName: string;
  cameraStream: MediaStream | null;
  onStart: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState>("idle");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (videoRef.current && cameraStream && !photoUrl) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, photoUrl]);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const uploadPhoto = useCallback(
    async (blob: Blob) => {
      setUpload("uploading");
      try {
        const res = await fetch(`${GATEWAY_URL}/upload/${token}/photo`, {
          method: "POST",
          headers: { "content-type": "image/jpeg" },
          body: blob,
        });
        setUpload(res.ok ? "done" : "fail");
      } catch {
        setUpload("fail");
      }
    },
    [token]
  );

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Draw un-mirrored — the stored photo should be true orientation.
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        blobRef.current = blob;
        setPhotoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        void uploadPhoto(blob);
      },
      "image/jpeg",
      0.92
    );
  }, [uploadPhoto]);

  const retake = useCallback(() => {
    blobRef.current = null;
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUpload("idle");
  }, []);

  return (
    <div className="w-full max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 [text-wrap:balance]">
        Quick identity check
      </h1>
      <p className="mt-2 text-sm text-zinc-400">
        Center your face in the frame and take a photo. This confirms who is
        taking the interview.
      </p>

      <Panel className="mt-8 overflow-hidden p-4">
        <div className="relative overflow-hidden rounded-xl bg-black/40">
          {photoUrl ? (
            // Mirrored preview so it matches what the candidate just saw.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Your identity snapshot"
              className="aspect-[4/3] w-full -scale-x-100 object-cover"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="aspect-[4/3] w-full -scale-x-100 object-cover"
              />
              {/* Face guide */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[62%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-white/30"
                style={{ boxShadow: "0 0 0 9999px rgba(4,10,8,0.35)" }}
              />
              <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-xs font-medium text-white/80">
                Center your face inside the oval
              </p>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-3">
          {photoUrl ? (
            <>
              <GhostButton onClick={retake} className="h-10 px-4 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> Retake
              </GhostButton>
              {upload === "uploading" && (
                <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving photo…
                </span>
              )}
              {upload === "done" && (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} /> Photo saved
                </span>
              )}
              {upload === "fail" && (
                <GhostButton
                  className="h-10 px-4 text-xs text-red-300"
                  onClick={() => {
                    if (blobRef.current) void uploadPhoto(blobRef.current);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Upload failed — retry
                </GhostButton>
              )}
            </>
          ) : (
            <button
              onClick={capture}
              className="group flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/40 bg-white/10 transition-colors hover:border-emerald-300 hover:bg-emerald-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
              aria-label="Take photo"
            >
              <Camera className="h-5 w-5 text-white transition-colors group-hover:text-emerald-200" />
            </button>
          )}
        </div>
      </Panel>

      <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-emerald-500"
        />
        <span>
          I confirm that I am <span className="font-medium text-zinc-100">{candidateName}</span>{" "}
          and I&rsquo;m taking this interview myself.
        </span>
      </label>

      <div className="mt-8 flex justify-end">
        <PrimaryButton onClick={onStart} disabled={upload !== "done" || !confirmed}>
          Start interview
        </PrimaryButton>
      </div>
    </div>
  );
}
