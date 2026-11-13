using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

// 主题清单（prototype/themes.json）：页面映射与产品权限共用同一份清单。
// 本分支全部主题已解锁：只要主题是 ready 且有页面就允许切换（product 仅保留作说明）。
static class Themes
{
    static Dictionary<string, object> Find(string pageDir, string id)
    {
        if (id == null) return null;
        try
        {
            var root = Json.Parse(File.ReadAllText(Path.Combine(pageDir, "themes.json"), Encoding.UTF8)) as Dictionary<string, object>;
            if (root == null) return null;
            foreach (object o in (System.Collections.IEnumerable)root["themes"])
            {
                var theme = o as Dictionary<string, object>;
                if (theme != null && (theme["id"] as string) == id &&
                    theme.ContainsKey("status") && (theme["status"] as string) == "ready")
                    return theme;
            }
        }
        catch (Exception ex) { Log.Write("读取 themes.json 失败：" + ex.Message); }
        return null;
    }

    public static string PageFor(string pageDir, string id)
    {
        var theme = Find(pageDir, id);
        return theme == null ? null : theme["page"] as string;
    }

    public static string ProductFor(string pageDir, string id)
    {
        var theme = Find(pageDir, id);
        object product;
        return theme != null && theme.TryGetValue("product", out product) ? product as string : null;
    }

    // 本分支解锁全部主题：只要 themes.json 里有页面就允许切换，不再看 product/授权。
    public static bool Allowed(string pageDir, string id, Func<string, bool> owns)
    {
        return PageFor(pageDir, id) != null;
    }
}
