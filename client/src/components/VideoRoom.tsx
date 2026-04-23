import { useEffect, useRef } from "react";
import { ZegoUIKitPrebuilt } from "@zegocloud/zego-uikit-prebuilt";

type VideoRoomProps = {
  appId: number;
  serverSecret: string;
  roomId: string;
  userId: string;
  userName: string;
  onJoined?: () => void;
  isAudioOnly?: boolean;
};

// Tracks whether a Zego destroy is currently in progress globally.
// Prevents a new instance from starting before the old one fully tears down.
let destroyInProgress = false;
let destroyResolve: (() => void) | null = null;

function waitForDestroyComplete(): Promise<void> {
  if (!destroyInProgress) return Promise.resolve();
  return new Promise((resolve) => {
    destroyResolve = resolve;
  });
}

function signalDestroyComplete() {
  destroyInProgress = false;
  if (destroyResolve) {
    destroyResolve();
    destroyResolve = null;
  }
}

function safeDestroy(instance: ZegoUIKitPrebuilt) {
  destroyInProgress = true;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        instance.destroy();
      } catch {
        // createSpan crash — suppressed
      } finally {
        setTimeout(signalDestroyComplete, 800);
      }
    });
  });
}

export function VideoRoom({
  appId,
  serverSecret,
  roomId,
  userId,
  userName,
  onJoined,
  isAudioOnly,
}: VideoRoomProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onJoinedRef = useRef(onJoined);

  useEffect(() => {
    onJoinedRef.current = onJoined;
  }, [onJoined]);

  useEffect(() => {
    if (!containerRef.current || !appId || !serverSecret) return;

    const container = containerRef.current;
    let instance: ZegoUIKitPrebuilt | null = null;
    let cleanedUp = false;
    let observer: MutationObserver | null = null;
    let hasReportedJoin = false;
    let zegoContainer: HTMLDivElement | null = null;

    const init = async () => {
      await waitForDestroyComplete();
      if (cleanedUp) return;

      const currentContainer = document.createElement("div");
      currentContainer.style.cssText = "width:100%;height:100%;";
      container.appendChild(currentContainer);
      zegoContainer = currentContainer;

      let kitToken: string;
      try {
        kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
          appId,
          serverSecret,
          roomId,
          userId,
          userName
        );
      } catch (err) {
        console.error("Failed to generate Zego kit token:", err);
        currentContainer.remove();
        return;
      }

      if (cleanedUp) {
        currentContainer.remove();
        return;
      }

      try {
        instance = ZegoUIKitPrebuilt.create(kitToken);
        (instance as any)._zegoContainer = currentContainer;
      } catch (err) {
        console.error("Failed to create Zego instance:", err);
        currentContainer.remove();
        return;
      }

      if (cleanedUp) {
        safeDestroy(instance);
        instance = null;
        return;
      }

      observer = new MutationObserver(() => {
        const resumeButton = Array.from(
          currentContainer.querySelectorAll<HTMLButtonElement>("button")
        ).find((button) => button.textContent?.trim() === "Resume");

        if (resumeButton) {
          resumeButton.style.setProperty("display", "inline-flex", "important");
          resumeButton.style.setProperty("visibility", "visible", "important");
          resumeButton.style.setProperty("opacity", "1", "important");
          resumeButton.click();
        }

        const roomButtons = currentContainer.querySelectorAll<HTMLElement>('button, [role="button"]');
        roomButtons.forEach((button) => {
          if (button.textContent?.trim() === "Resume") return;
          button.style.setProperty("display", "none", "important");
          button.style.setProperty("visibility", "hidden", "important");
          button.style.setProperty("opacity", "0", "important");
        });

        const containerRect = currentContainer.getBoundingClientRect();
        const allElements = currentContainer.querySelectorAll<HTMLElement>("*");

        allElements.forEach((element) => {
          const text = element.textContent?.trim() ?? "";

          if (text.includes("Media play failed") || text === "Resume") {
            let parent = element.parentElement;
            for (let i = 0; i < 5; i++) {
              if (parent) {
                parent.style.setProperty("display", "none", "important");
                parent.style.setProperty("visibility", "hidden", "important");
                parent.style.setProperty("opacity", "0", "important");
                parent = parent.parentElement;
              }
            }
          }

          if (text === "Resume") return;

          const rect = element.getBoundingClientRect();
          const hasSvg = element.querySelector("svg") !== null;
          const nearBottom = rect.top > containerRect.top + containerRect.height * 0.7;
          const nearTop = rect.top < containerRect.top + 88;
          const nearRight = rect.right > containerRect.right - 96;
          const nearCenter =
            rect.left < containerRect.left + containerRect.width * 0.7 &&
            rect.right > containerRect.left + containerRect.width * 0.3 &&
            rect.top < containerRect.top + containerRect.height * 0.7 &&
            rect.bottom > containerRect.top + containerRect.height * 0.3;

          const isButtonOrIcon =
            element.tagName === "BUTTON" ||
            element.getAttribute("role") === "button" ||
            hasSvg;
          const isBottomControl = isButtonOrIcon && nearBottom;
          const isTopRightUtility =
            isButtonOrIcon &&
            nearTop &&
            nearRight &&
            rect.width <= 88 &&
            rect.height <= 88;

          if (isBottomControl || isTopRightUtility) {
            element.style.setProperty("display", "none", "important");
            element.style.setProperty("visibility", "hidden", "important");
            element.style.setProperty("opacity", "0", "important");
            if (
              element.parentElement &&
              element.parentElement.getBoundingClientRect().height < 100
            ) {
              element.parentElement.style.setProperty("display", "none", "important");
            }
          }

          const looksLikeNameBadge =
            hasSvg &&
            nearBottom &&
            !nearCenter &&
            rect.width < 260 &&
            rect.height < 90 &&
            text.length > 0;

          if (looksLikeNameBadge) {
            const svgs = element.querySelectorAll<SVGElement>("svg");
            svgs.forEach((svg) => {
              svg.style.setProperty("display", "none", "important");
            });
          }
        });

        if (hasReportedJoin) return;
        const videos = currentContainer.querySelectorAll("video");
        if (videos.length >= 1) {
          hasReportedJoin = true;
          onJoinedRef.current?.();
        }
      });
      observer.observe(currentContainer, { childList: true, subtree: true });

      instance.joinRoom({
        container: currentContainer,
        scenario: { mode: ZegoUIKitPrebuilt.VideoConference },
        layout: "Grid",
        turnOnCameraWhenJoining: !isAudioOnly,
        turnOnMicrophoneWhenJoining: true,
        showScreenSharingButton: false,
        showPreJoinView: false,
        showLayoutButton: false,
        showRoomTimer: false,
        showLeavingView: false,
        showUserList: false,
        showUserName: false,
        showRoomDetailsButton: false,
        showMyCameraToggleButton: false,
        showMyMicrophoneToggleButton: false,
        showAudioVideoSettingsButton: false,
        showTextChat: false,
        lowerLeftNotification: {
          showUserJoinAndLeave: false,
          showTextChat: false,
        },
        showNonVideoUser: true,
        sharedLinks: [],
        videoScreenConfig: {
          objectFit: "cover",
          localMirror: true,
          pullStreamMirror: false,
        },
        onJoinRoom: () => {
          if (hasReportedJoin) return;
          hasReportedJoin = true;
          onJoinedRef.current?.();
        },
      });
    };

    init();

    return () => {
      cleanedUp = true;
      observer?.disconnect();

      if (instance) {
        safeDestroy(instance);
        instance = null;
      }

      zegoContainer?.remove();
    };
  }, [appId, roomId, serverSecret, userId, userName]);

  // ✅ FIX: position:absolute + inset:0 ensures this div fully fills the
  // relatively-positioned .rcp-block parent. Without explicit dimensions,
  // Zego's child div (width:100%;height:100%) resolves to 0, collapsing
  // the flex block and causing the side-by-side layout bug.
  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
      }}
    />
  );
}