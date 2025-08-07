-- Create follow-up actions table for integrity management
CREATE TABLE IF NOT EXISTS follow_up_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL, -- 'suggest_resources' or 'schedule_viva'
    flag_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'cancelled'
    created_at TEXT NOT NULL,
    completed_at TEXT NULL,
    notes TEXT NULL,
    FOREIGN KEY (flag_id) REFERENCES integrity_flags(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Add follow_up_action_id to integrity_flags if it doesn't exist
ALTER TABLE integrity_flags ADD COLUMN follow_up_action_id INTEGER NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_follow_up_actions_flag_id ON follow_up_actions(flag_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_actions_user_id ON follow_up_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_actions_status ON follow_up_actions(status);

-- Add test_completion flag type to existing enums (if using enum constraints)
-- This is informational - SQLite handles this automatically

-- Insert sample follow-up actions for demo
INSERT OR IGNORE INTO follow_up_actions (id, action_type, flag_id, user_id, status, created_at, notes) VALUES
(1, 'suggest_resources', 1, 1, 'completed', '2024-01-15 10:30:00', 'Learning resources suggested for database normalization'),
(2, 'schedule_viva', 2, 1, 'pending', '2024-01-15 11:45:00', '2-minute viva scheduled for algorithm complexity');