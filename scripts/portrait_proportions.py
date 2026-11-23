"""Compare the normal Chromium composition with the approved, unsplit design plates."""

import base64
import time
from pathlib import Path

from playwright.sync_api import expect

DESIGNS = Path(__file__).resolve().parents[1] / "docs" / "design"
# Locations are on the original plate, in pixels. Each includes the original
# drawing scale, rather than individual layer bounds from the runtime rig.
PLATES = {
    "seorin": (
        "webp",
        (62, 6, 354 / 1536),
        {
            "eyes": (451, 264),
            "left_brow": (483, 220),
            "right_brow": (543, 215),
            "chin": (523, 432),
            "left_collar": (421, 572),
            "right_collar": (626, 571),
            "badge_corner": (708, 749),
            "folio_corner": (456, 918),
        },
    ),
    "hana": (
        "png",
        (57, 5, 0.24046875),
        {
            "eyes": (428, 297),
            "chin": (515, 478),
            "left_lapel": (384, 622),
            "right_lapel": (687, 601),
            "blazer_button": (534, 959),
            "notebook": (450, 1168),
        },
    ),
    "isol": (
        "png",
        (42, 4, 0.46 / 1.81),
        {
            "eyes": (469, 312),
            "chin": (552, 516),
            "left_collar": (414, 678),
            "right_collar": (734, 661),
            "belt": (561, 1365),
            "notebook": (451, 957),
        },
    ),
}


# Measured in stage units from each artist's registered shoulder, elbow,
# wrist and longest painted fingertip on the source greeting/point plates.
ARM_LENGTHS = {
    "seorin": {"upperArm": 101.2, "forearm": 73.7, "greeting": 63.5, "point": 61.2},
    "hana": {"upperArm": 89, "forearm": 85, "greeting": 74, "point": 69},
    "isol": {"upperArm": 110, "forearm": 90, "greeting": 64, "point": 65},
}


def check_breathing(torso):
    error = torso.evaluate("""async node => {
        let error = 0;
        for (let i = 0; i < 18; i++) {
            await new Promise(requestAnimationFrame);
            const m = node.parentElement.getScreenCTM().inverse().multiply(node.getScreenCTM());
            error = Math.max(error, Math.abs(Math.hypot(m.a, m.b) - 1),
                Math.abs(Math.hypot(m.c, m.d) - 1), Math.abs(m.a*m.c + m.b*m.d));
        }
        return error;
    }""")
    assert error < 1e-4, f"Breathing stretches the painted torso by {error:.5f}"
    return error


def compare_plate(portrait, character):
    extension, projection, landmarks = PLATES[character]
    source = (DESIGNS / f"{character}-original.{extension}").read_bytes()
    backdrop = ".avatar-panel__svg > g:first-of-type {visibility:hidden}"
    shot = portrait.screenshot(scale="device", style=backdrop)
    silhouette = portrait.screenshot(
        scale="device",
        style=backdrop + ".avatar-panel__svg {background:white !important} "
        ".avatar-panel__svg > g:last-of-type {filter:brightness(0)}",
    )
    return portrait.evaluate(
        """async (_, {images, projection, landmarks}) => {
            let sourceHeight;
            const frames = await Promise.all(images.map(async (data, i) => {
                const raw = Uint8Array.from(atob(data), c => c.charCodeAt(0));
                const image = await createImageBitmap(new Blob([raw]));
                const ctx = new OffscreenCanvas(360, 360).getContext('2d');
                ctx.imageSmoothingQuality = 'high';
                if (i === 0) {
                    sourceHeight = image.height;
                    const [x, y, k] = projection;
                    ctx.drawImage(image, x, y, image.width*k, image.height*k);
                } else {
                    ctx.drawImage(image, 0, 0, 360, 360);
                }
                return ctx.getImageData(0, 0, 360, 360).data;
            }));
            // Black paint on white yields compositor coverage independently of
            // the color of a hair strand, shirt, or the scene behind it.
            const [source, shot, silhouette] = frames;
            const sourceInk = at => source[at+3] > 127;
            const stageInk = at => silhouette[at] < 128;
            const widths = {};
            for (const [name, offset] of Object.entries({head: 0.17, shoulders: 0.45, torso: 0.70})) {
                const y = Math.round(projection[1]+projection[2]*sourceHeight*offset);
                const spans = [sourceInk, stageInk].map(ink => {
                    const xs = [];
                    // A single translucent flyaway can disappear at 1× DPR.
                    // Measure the solid silhouette across a five-pixel aperture.
                    for (let x=3; x<357; x++) {
                        let coverage = 0;
                        for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) {
                            if (ink(((y+dy)*360+x+dx)*4)) coverage++;
                        }
                        if (coverage >= 20) xs.push(x);
                    }
                    return xs.at(-1)-xs[0]+1;
                });
                widths[name] = spans;
            }
            function crown(ink) {
                for (let y=2; y<120; y++) {
                    let count = 0;
                    for (let x=100; x<240; x++) if (ink((y*360+x)*4)) count++;
                    if (count >= 4) return y;
                }
                throw Error('Crown is missing from the composited stage');
            }
            const result = {};
            for (const [name, [sx, sy]] of Object.entries(landmarks)) {
                const x = Math.round(projection[0] + sx*projection[2]);
                const y = Math.round(projection[1] + sy*projection[2]);
                // Small textured windows tolerate WebP encoding and antialiasing.
                // Locate the best color match near the intended anatomy.
                let best = {error: Infinity};
                for (let dy=-5; dy<=5; dy++) for (let dx=-5; dx<=5; dx++) {
                    let sum = 0, samples = 0;
                    for (let row=-5; row<=5; row++) for (let col=-5; col<=5; col++) {
                        const at = ((y+row)*360+x+col)*4;
                        if (source[at+3] < 225) continue;
                        samples++;
                        const shifted = at+(dy*360+dx)*4;
                        for (let c=0; c<3; c++)
                            sum += Math.abs(source[at+c] - shot[shifted+c]);
                    }
                    const error = sum/(samples*3);
                    if (error < best.error) best = {dx, dy, error};
                }
                result[name] = best;
            }
            const chinY = projection[1]+landmarks.chin[1]*projection[2];
            const headHeight = [chinY-crown(sourceInk), chinY+result.chin.dy-crown(stageInk)];
            return {marks: result, widths, headHeight};
        }""",
        {
            "images": [base64.b64encode(raw).decode("ascii") for raw in (source, shot, silhouette)],
            "projection": projection,
            "landmarks": landmarks,
        },
    )


def check_proportions(page, base, token):
    # Keep each native compositor frame still while decoding paint masks and
    # sampling the screenshot. The regular audio tests keep their real clock.
    page.clock.install(time=1750000000000)
    page.clock.pause_at(1750000000300)
    failed_assets = []
    page.on("requestfailed", lambda request: failed_assets.append((request.url, request.failure)))
    page.on(
        "response", lambda r: failed_assets.append((r.url, r.status)) if r.status >= 400 else None
    )
    page.goto(f"{base}/#token={token}")
    page.get_by_role("button", name="연결", exact=True).evaluate("button => button.click()")
    expect(page.get_by_text("대화 준비됨")).to_be_visible()
    paint_probe = Path(__file__).with_name("portrait_joints.js").read_text(encoding="utf-8")
    joint_probe = f"({paint_probe})"
    preview = page.locator("details.avatar-panel__preview")
    measures = {}
    for character in PLATES:
        page.get_by_label("아바타 종류").select_option(
            "builtin" if character == "seorin" else character
        )
        portrait = page.locator(f'svg[data-character="{character}"]')
        expect(portrait.locator(".narration__torso")).to_be_visible()
        page.clock.run_for(48)
        neutral = compare_plate(portrait, character)
        measures[character] = {"landmarks": neutral, "neutral": portrait.evaluate(joint_probe)}
        assert all(
            m["error"] < 24 and max(abs(m["dx"]), abs(m["dy"])) <= 3
            for m in neutral["marks"].values()
        ), (character, neutral)
        for part, (source, rendered) in {
            **neutral["widths"],
            "crown_to_chin": neutral["headHeight"],
        }.items():
            assert abs(source - rendered) <= 4, (character, part, source, rendered)
        neck = measures[character]["neutral"]["gaps"]["neck"]
        assert neck is not None and neck <= 2, (character, measures[character])
        preview.locator("summary").evaluate("button => button.click()")
        for pose, label in [("greeting", "인사하기"), ("point", "가리켜 설명하기")]:
            preview.get_by_role("button", name=label).evaluate("button => button.click()")
            # HTTP and image decoding use real time. Start the gesture sample
            # window only once all its layers are decoded and the real hand mounts.
            hand = portrait.locator(f'.avatar-panel__hand [data-pose="{pose}"] image')
            deadline = time.monotonic() + 10
            while not hand.count():
                assert time.monotonic() < deadline, (
                    character,
                    pose,
                    "hand did not mount",
                    failed_assets,
                )
                page.clock.run_for(17)
            samples = measures[character][pose] = []
            for _ in range(150):
                page.clock.run_for(17)
                lift = portrait.evaluate("svg => Number(svg.style.getPropertyValue('--arm-lift'))")
                if (not samples and 0.4 <= lift < 0.8) or (len(samples) == 1 and lift >= 0.99):
                    frame = portrait.evaluate(joint_probe)
                    assert all(gap is not None and gap <= 2 for gap in frame["gaps"].values()), (
                        character,
                        pose,
                        lift,
                        frame,
                    )
                    reference = ARM_LENGTHS[character]
                    for part in ("upperArm", "forearm", "reach"):
                        target = reference[pose if part == "reach" else part]
                        assert abs(frame[part] - target) <= 2, (
                            character,
                            pose,
                            part,
                            frame,
                            target,
                        )
                    samples.append(frame)
                    if len(samples) == 2:
                        break
            assert len(samples) == 2, (character, pose, samples)
            assert abs(samples[0]["reach"] - samples[1]["reach"]) < 2, (character, pose, samples)
            page.clock.run_for(2600)
        preview.locator("summary").evaluate("button => button.click()")
    return measures
