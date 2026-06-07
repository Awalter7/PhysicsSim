import * as React from "react";
import {
  PlasmicComponent,
  extractPlasmicQueryData,
  ComponentRenderData,
  PlasmicRootProvider,
} from "@plasmicapp/loader-nextjs";

import Error from "next/error";
import { useRouter } from "next/router";
import { PLASMIC } from "@/plasmic-init";

export default function PlasmicLoaderPage(props) {
  const { plasmicData, queryCache } = props;
  const router = useRouter();
  
  if (!plasmicData || plasmicData.entryCompMetas.length === 0) {
    return <Error statusCode={404} />;
  }
  const pageMeta = plasmicData.entryCompMetas[0];

  // const originalLog = console.log;

  // console.log = function (...args) {
  //   // Check if the message contains the target text
  //   const message = args.join(" ");
  //   if (message.includes("Shader compilation complete")) {
  //     // ✅ Trigger your detection logic here
  //     console.info("[Detector] Shader compilation complete detected!");
  //     // You can dispatch an event, call a callback, set state, etc.
  //     window.dispatchEvent(new Event("shader-compiled"));
  //   }

  //   // Still run the original log
  //   originalLog.apply(console, args);
  // };

  return (
    <PlasmicRootProvider
      loader={PLASMIC}
      prefetchedData={plasmicData}
      prefetchedQueryData={queryCache}
      pageRoute={pageMeta.path}
      pageParams={pageMeta.params}
      pageQuery={router.query}
    >
      <PlasmicComponent component={pageMeta.displayName} />
    </PlasmicRootProvider>
  );
}

export const getStaticProps = async (context) => {
  const { catchall } = context.params ?? {};
  const plasmicPath = typeof catchall === 'string' ? catchall : Array.isArray(catchall) ? `/${catchall.join('/')}` : '/';
  let plasmicData;
  try {
    plasmicData = await PLASMIC.maybeFetchComponentData(plasmicPath);
  } catch (err) {
    // If the Plasmic API is unavailable or timing out during build, fail
    // gracefully so the Next build can continue. At runtime the page will
    // still be able to fetch from Plasmic when the host is reachable.
    console.error("Plasmic maybeFetchComponentData failed:", err);
    return { props: {} };
  }
  if (!plasmicData) {
    // non-Plasmic catch-all
    return { props: {} };
  }
  const pageMeta = plasmicData.entryCompMetas[0];
  // Cache the necessary data fetched for the page
  const queryCache = await extractPlasmicQueryData(
    <PlasmicRootProvider
      loader={PLASMIC}
      prefetchedData={plasmicData}
      pageRoute={pageMeta.path}
      pageParams={pageMeta.params}
    >
      <PlasmicComponent component={pageMeta.displayName} />
    </PlasmicRootProvider>
  );
  // Use revalidate if you want incremental static regeneration
  return { props: { plasmicData, queryCache }, revalidate: 60 };
}

export const getStaticPaths = async () => {
  try {
    const pageModules = await PLASMIC.fetchPages();
    return {
      paths: pageModules.map((mod) => ({
        params: {
          catchall: mod.path.substring(1).split("/"),
        },
      })),
      fallback: "blocking",
    };
  } catch (err) {
    // If Plasmic can't be reached during build, return a permissive
    // fallback so the pages can be generated at request time instead of
    // failing the build.
    console.error("Plasmic.fetchPages failed during build:", err);
    return { paths: [], fallback: "blocking" };
  }
}
