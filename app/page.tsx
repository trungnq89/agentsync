import { getActor } from './_lib/actor';

export default async function Home() {
  const user = await getActor();
  return (
    <main>
      <h1 className="text-xl font-semibold">Xin chào, {user.displayName}</h1>
    </main>
  );
}
