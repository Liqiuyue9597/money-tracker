"use client";

import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AuthForm() {
  const { signIn, signUp } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        setMessage("注册成功！请检查邮箱确认链接。");
      } else {
        await signIn(email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center pb-2">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Wallet className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">MoneyTracker</CardTitle>
          <p className="text-sm text-muted-foreground">个人记账工具</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 rounded-xl"
            />
            <Input
              type="password"
              placeholder="密码（至少6位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-12 rounded-xl"
            />

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            {message && (
              <p className="text-sm text-emerald-600">{message}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl text-base"
            >
              {loading ? "处理中..." : isSignUp ? "注册" : "登录"}
            </Button>

            <button
              type="button"
              className="w-full text-sm text-muted-foreground"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
                setMessage("");
              }}
            >
              {isSignUp ? "已有账户？" : "没有账户？"}
              <span className="text-primary font-medium ml-1">
                {isSignUp ? "登录" : "注册"}
              </span>
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
