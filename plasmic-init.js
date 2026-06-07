// plasmic-init.js
import { initPlasmicLoader } from "@plasmicapp/loader-nextjs";
import { Planets } from "./components/three/scenes/planets";

export const PLASMIC = initPlasmicLoader({
  projects: [
    {
      id: "qzNTthaxGnU7ghYS5cuyek",
      token: "myoJoAr39I3FE85DHfSzVkQmfOmhNB64HiVWzs7wheypKTRdkxBJm3uWx0wlEavv0UuIHoCtDk9Rq2Vzvo4kA",
    },
  ],
  preview: true,
});


PLASMIC.registerComponent(Planets, {
  name: "PlanetScene",
  displayName: "Planet Scene",
  props: {
    className: {
      type: "string",
      description: "Additional CSS classes",
    },
    id: {
      type: "string",
      displayName: "id"
    },
  },
  importPath: "./components/three/scenes/planets",
  isDefaultExport: false,
})




 // Legacy props for backwards compatibility (hidden when breakpoints are used)
    // startTop: {
    //   type: "string",
    //   displayName: "Start Top",
    //   description: "Initial top position (e.g., '100px', '50vh', '10%')",
    //   defaultValueHint: "0px",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // startLeft: {
    //   type: "string",
    //   displayName: "Start Left",
    //   description: "Initial left position (e.g., '0px', '25vw')",
    //   defaultValueHint: "0px",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // startRight: {
    //   type: "string",
    //   displayName: "Start Right",
    //   description: "Initial right position (e.g., '0px', '10vw')",
    //   defaultValueHint: "0px",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // startBottom: {
    //   type: "string",
    //   displayName: "Start Bottom",
    //   description: "Initial bottom position (e.g., '20px', '5vh')",
    //   defaultValueHint: "0px",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // endTop: {
    //   type: "string",
    //   displayName: "End Top",
    //   description: "Final top position (e.g., '500px', '80vh')",
    //   defaultValueHint: "0px",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // endLeft: {
    //   type: "string",
    //   displayName: "End Left",
    //   description: "Final left position (e.g., '100px', '50vw')",
    //   defaultValueHint: "0px",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // endRight: {
    //   type: "string",
    //   displayName: "End Right",
    //   description: "Final right position (e.g., '100px', '20vw')",
    //   defaultValueHint: "0px",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // endBottom: {
    //   type: "string",
    //   displayName: "End Bottom",
    //   description: "Final bottom position (e.g., '100px', '10vh')",
    //   defaultValueHint: "0px",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // scrollStart: {
    //   type: "number",
    //   defaultValue: 0,
    //   displayName: "Scroll Start (px)",
    //   description: "Interpolation: animation start | Duration: trigger point",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // scrollEnd: {
    //   type: "number",
    //   defaultValue: 1000,
    //   displayName: "Scroll End (px)",
    //   description: "Scroll position where interpolation completes (interpolation mode only)",
    //   hidden: (props) => props.animationMode !== "interpolation" || (props.breakpoints && props.breakpoints.length > 0),
    // },
    // startOpacity: {
    //   type: "number",
    //   defaultValue: 1,
    //   min: 0,
    //   max: 1,
    //   displayName: "Start Opacity",
    //   description: "Initial opacity (0-1)",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // endOpacity: {
    //   type: "number",
    //   defaultValue: 1,
    //   min: 0,
    //   max: 1,
    //   displayName: "End Opacity",
    //   description: "Final opacity (0-1)",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // startBorderRadius: {
    //   type: "string",
    //   displayName: "Start Border Radius",
    //   description: "Initial border radius (e.g., '0px', '50%', '20px')",
    //   defaultValueHint: "0px",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // endBorderRadius: {
    //   type: "string",
    //   displayName: "End Border Radius",
    //   description: "Final border radius (e.g., '50%', '100px', '0px')",
    //   defaultValueHint: "0px",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // startWidth: {
    //   type: "string",
    //   displayName: "Start Width",
    //   description: "Initial width (e.g., '100px', '50vw', '100%')",
    //   defaultValueHint: "auto",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // endWidth: {
    //   type: "string",
    //   displayName: "End Width",
    //   description: "Final width (e.g., '200px', '80vw', '50%')",
    //   defaultValueHint: "auto",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // startHeight: {
    //   type: "string",
    //   displayName: "Start Height",
    //   description: "Initial height (e.g., '100px', '50vh', '100%')",
    //   defaultValueHint: "auto",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // endHeight: {
    //   type: "string",
    //   displayName: "End Height",
    //   description: "Final height (e.g., '200px', '80vh', '50%')",
    //   defaultValueHint: "auto",
    //   hidden: (props) => props.breakpoints && props.breakpoints.length > 0,
    // },
    // zIndex: {
    //   type: "number",
    //   defaultValue: 1000,
    //   displayName: "Z-Index",
    //   description: "Stacking order",
    // },