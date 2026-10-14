# KRYSTAL-DECK // KD-990 Skeleton Polycarbonate Walkman

An interactive 3D WebGL study of a 1990s skeleton clear-polycarbonate portable cassette player, built with **Three.js**, **custom GLSL optical shaders**, and a **real-time WebAudio synthesizer & tape-physics engine** on **Next.js**.

## Run It

```bash
npm install && npm run dev
```

Then open [http://localhost:3088](http://localhost:3088).

## Controls & Tactile Interactions

| Action | Result |
| :--- | :--- |
| **Click 3D Top Keys** or **Space** | Latch `PLAY` / `PAUSE` — engages the magnetic read-head bridge, spins up the brass flywheels, and starts the WebAudio synth |
| **Click Door** or **O** | Swing open or close the damped clear polycarbonate door |
| **Drag the Walkman** | Turn and inspect the 3D assembly with pointer-parallax inertia |
| **Drag Spinning Reel** | Physically scrub, slow down, or bend the tape pitch in real time |
| **F** | Eject cassette and flip between **Side A** and **Side B** in mid-air |
| **E** | Eject and cycle through the **4 designer cassettes** |
| **[** / **]** | High-speed `REW` / `FF` spooling with audible warbled tape scrubbing |
| **X** | Toggle **X-Ray Exploded CAD View** (separates all 5 mechanical layers along the Z-axis) |
| **Drop any `.mp3` / `.wav`** | Loads your own audio file onto a custom-printed cassette with real-time tape physics |
