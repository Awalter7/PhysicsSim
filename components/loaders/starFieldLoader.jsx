import { Component, createRef } from "react";


import { usePlasmicCanvasContext } from '@plasmicapp/loader-nextjs'

const NUM_STARS  = 500;

// Stellar classification by color temperature and rarity
// Rarity weights are approximate inverse of real-world frequency
// M-type is most common (~76%), O-type is rarest (~0.00003%)
const STELLAR_CLASSES = [
  // { type, kelvin range, RGB color, weight (higher = more common) }
  // Colors are white-blended for brightness: lerped ~60% toward (255,255,255)
  { type: "O", kelvinMin: 30000, kelvinMax: 50000, r: 220, g: 228, b: 255, weight: 0.00003 }, // Blue-white
  { type: "B", kelvinMin: 10000, kelvinMax: 30000, r: 222, g: 230, b: 255, weight: 0.13   }, // Blue-white
  { type: "A", kelvinMin:  7500, kelvinMax: 10000, r: 235, g: 240, b: 255, weight: 0.6    }, // Near-white
  { type: "F", kelvinMin:  6000, kelvinMax:  7500, r: 252, g: 251, b: 255, weight: 3      }, // White with faint yellow
  { type: "G", kelvinMin:  5200, kelvinMax:  6000, r: 255, g: 252, b: 235, weight: 7      }, // Warm white
  { type: "K", kelvinMin:  3700, kelvinMax:  5200, r: 255, g: 235, b: 210, weight: 12     }, // Pale orange-white
  { type: "M", kelvinMin:  2400, kelvinMax:  3700, r: 255, g: 228, b: 190, weight: 76     }, // Warm white-orange
];

// Precompute cumulative weights for weighted random selection
const totalWeight = STELLAR_CLASSES.reduce((sum, c) => sum + c.weight, 0);
const cumulativeWeights = [];
let cumSum = 0;
for (const cls of STELLAR_CLASSES) {
  cumSum += cls.weight;
  cumulativeWeights.push(cumSum / totalWeight);
}

function pickStellarClass() {
  const r = Math.random();
  for (let i = 0; i < cumulativeWeights.length; i++) {
    if (r <= cumulativeWeights[i]) return STELLAR_CLASSES[i];
  }
  return STELLAR_CLASSES[STELLAR_CLASSES.length - 1];
}

class Star {
    constructor(x, y, width, height, ctx) {
        this.ctx = ctx;

        this.pos     = { x, y };
        this.prevPos = { x, y };

        this.vel = { x: 0, y: 0 };

        this.ang = Math.atan2(
            y - height / 2,
            x - width / 2
        );

        this.z3d  = 0;
        this.size = Math.random() * 1.5 + 0.5;
        this.alpha = 0;

        // Assign stellar classification by rarity-weighted random
        const cls = pickStellarClass();
        this.r = cls.r;
        this.g = cls.g;
        this.b = cls.b;


        // O and B type stars are brighter/larger
        if (cls.type === "O") {
            this.size = Math.random() * 2.5 + 1.5;
        } else if (cls.type === "B") {
            this.size = Math.random() * 2.0 + 1.0;
        }
    }

    update(acc, shouldDamp) {
        this.vel.x += Math.cos(this.ang) * acc;
        this.vel.y += Math.sin(this.ang) * acc;


        const stretchFactor = 200; // tweak this to taste
        this.prevPos.x = this.pos.x - this.vel.x * acc * stretchFactor;
        this.prevPos.y = this.pos.y - this.vel.y * acc * stretchFactor;

        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;

        const speed = Math.sqrt(this.vel.x ** 2 + this.vel.y ** 2);
        this.z3d += speed;

        this.alpha = Math.min(1, this.alpha + 0.05);
    }

    map(value, inMin, inMax, outMin, outMax) {
        return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
    }

    draw() {
        this.ctx.beginPath();
        this.ctx.moveTo(this.prevPos.x, this.prevPos.y);
        this.ctx.lineTo(this.pos.x, this.pos.y);

        const mag   = Math.hypot(this.vel.x, this.vel.y);

        const gradient = this.ctx.createLinearGradient(
            this.pos.x,     this.pos.y,      // ← start (stop 0) = head = opaque
            this.prevPos.x, this.prevPos.y   // ← end   (stop 1) = tail = transparent
        );

        gradient.addColorStop(0,   `rgba(${this.r}, ${this.g}, ${this.b}, 1)`);
        gradient.addColorStop(0.5, `rgba(${this.r}, ${this.g}, ${this.b}, .25)`);
        gradient.addColorStop(1,   `rgba(${this.r}, ${this.g}, ${this.b}, 0)`);


        // gradient.addColorStop(1, `rgba(${this.r}, ${this.g}, ${this.b}, 1)`);

        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth   = this.size * 2;
        this.ctx.lineCap     = "round";
        this.ctx.stroke();
    }
}


class StarField extends Component {
    constructor(props) {
        super(props);

        this.className = props.className ?? "";

        this.speedVal = 0.0;
        this.lerpVal  = 0.05;

        this.canvasRef = createRef();
        this.canvas    = null;
        this.ctx       = null;

        this.stars = null;

        this.currentAcc         = 0;
        this.animId             = null;
        this.displayedTargetAcc = 0;

        // Bind so requestAnimationFrame preserves `this`
        this.update  = this.update.bind(this);
        this.setSize = this.setSize.bind(this);

        this.timer1;
        this.timer2;
    }

    // --- helpers ---
    random(max)           { return Math.random() * max; }
    onScreen(x, y)        { return x >= 0 && x <= this.canvas.width && y >= 0 && y <= this.canvas.height; }
    lerp(a, b, t)         { return a + (b - a) * t; }

    setSize() {
        this.canvas.width  = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    componentDidMount() {
        this.canvas = this.canvasRef.current;
        this.ctx    = this.canvas.getContext("2d");

        this.setSize();
        window.addEventListener("resize", this.setSize);

        this.stars              = Array.from({ length: NUM_STARS }, () => new Star(this.random(this.canvas.width), this.random(this.canvas.height), this.canvas.width, this.canvas.height, this.ctx));
        this.currentAcc         = this.speedVal;
        this.displayedTargetAcc = this.speedVal;

        this.update();

        this.speedVal = .04;

        this.timer1 = setTimeout(() => {
            this.speedVal = .13;
        }, 5000);

        this.timer2 = setTimeout(() => {
            this.speedVal = 0;
        }, 8000);
    }

    componentWillUnmount() {
        cancelAnimationFrame(this.animId);
        window.removeEventListener("resize", this.setSize);

        if (this.timer1) clearTimeout(this.timer1);
        if (this.timer2) clearTimeout(this.timer2);
    }

    update() {
        const W = this.canvas.width;
        const H = this.canvas.height;

        const targetAcc = this.speedVal;
        this.ctx.clearRect(0, 0, W, H);

        this.displayedTargetAcc = this.lerp(this.displayedTargetAcc, targetAcc, 0.005);
        this.currentAcc         = this.lerp(this.currentAcc, targetAcc, this.lerpVal);

        // if (this.currentAcc < 0.0001) {
        //     cancelAnimationFrame(this.animId);
        //     return;
        // }

        this.stars = this.stars.filter((star) => {
            star.update(this.currentAcc);
            star.draw(this.ctx);
            return this.onScreen(star.pos.x, star.pos.y);
        });

        while (this.stars.length < NUM_STARS) {
            this.stars.push(
                new Star(
                    W / 2 + (Math.random() - 0.5) * 2000,
                    H / 2 + (Math.random() - 0.5) * 1000,
                    W,          // ← width
                    H,          // ← height
                    this.ctx    // ← ctx
                )
            );
        }

        this.animId = requestAnimationFrame(this.update);
    }

    render() {
        return (
            <div
                className={this.className}
                style={{
                    width:           "100vw",
                    height:          "100vh",
                    overflow:        "hidden",
                    backgroundColor: "black",
                }}
            >
                <canvas
                    ref={this.canvasRef}
                    style={{
                        display:         "block",
                        width:           "100%",
                        height:          "100%",
                        opacity:         1,
                        transitionDelay: "5s",
                        transition:      "opacity 2s ease-in",
                    }}
                />
            </div>
        );
    }
}

export default function StarFieldLoader(){
    const inEditor = usePlasmicCanvasContext();
    console.log("starFieldLoader")
    return(
        <>
            {
                !inEditor
                &&
                <StarField />
            }
        </>
    )
}