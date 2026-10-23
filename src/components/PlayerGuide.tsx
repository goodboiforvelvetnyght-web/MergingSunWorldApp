import { Modal } from "./Modal";
import {
  BookOpen,
  Compass,
  UserRound,
  Castle,
  MessageCircle,
  CalendarDays,
} from "lucide-react";
export function PlayerGuide({
  onClose,
  onCreate,
  onExplore,
  hasCharacter,
  pending,
}: {
  onClose: () => void;
  onCreate: () => void;
  onExplore: () => void;
  hasCharacter: boolean;
  pending: boolean;
}) {
  return (
    <Modal
      title="Your story begins here"
      subtitle="A short guide to the Merging Sun beta"
      onClose={onClose}
    >
      <div className="player-guide">
        <section>
          <UserRound />
          <div>
            <h3>Create your character</h3>
            <p>
              Choose a name and starting city, write your backstory, and submit
              your character for admin approval. If changes are requested, read
              the reason, edit, and resubmit.
            </p>
          </div>
        </section>
        <section>
          <BookOpen />
          <div>
            <h3>Explore while you wait</h3>
            <p>
              You can explore the map and read about kingdoms, cities, and world
              lore while your character awaits approval. Discover the stories
              that will shape your journey.
            </p>
          </div>
        </section>
        <section>
          <Compass />
          <div>
            <h3>Travel after approval</h3>
            <p>
              Preview a route to see its energy cost. Travel completes
              immediately when you spend the energy. Energy recovers over time.
            </p>
          </div>
        </section>
        <section>
          <Castle />
          <div>
            <h3>Enter a city</h3>
            <p>
              Arriving on a city's hex leaves you outside. Choose Enter city to
              go inside and visit its internal locations. Back to map only
              changes your view; Leave city takes your character outside so you
              can travel again.
            </p>
          </div>
        </section>
        <section className="guide-future">
          <MessageCircle />
          <div>
            <h3>
              Meet, chat, and join adventures <span>Future updates</span>
            </h3>
            <p>
              Chat with people you meet and join events connected to our
              real-life LARP adventures. Chat and events are coming in future
              updates.
            </p>
          </div>
        </section>
        <p className="beta-note">
          This is a closed beta for our friends. Features may change and
          character progress may be reset. Send feedback through Messenger.
        </p>
        <div className="guide-actions">
          <button className="button primary" onClick={onExplore}>
            Explore the lore
          </button>
          {!hasCharacter && !pending && (
            <button className="button secondary" onClick={onCreate}>
              Create your character
            </button>
          )}
          <button className="text-button" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}
